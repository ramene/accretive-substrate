/**
 * @accretive-substrate/deliberation/observers/specialist-dissent
 *
 * Detects specialists who consistently dissent against the adjudicated
 * majority. Pattern: same (specialist × verdict) opposing the adjudication
 * verdict N+ times in 30min window. Emits a `gate-def:<specialist>-weight`
 * accretion suggesting weight recalibration.
 */

import { getPool } from '../store.mjs';

const DEFAULT_N_THRESHOLD = 3;
const DEFAULT_WINDOW_MINUTES = 30;
const COOLDOWN_MINUTES = 30;

let _accretiveModule = null;
async function _loadAccretive() {
  if (_accretiveModule) return _accretiveModule;
  try { _accretiveModule = await import('@accretive-substrate/accretive'); } catch { _accretiveModule = null; }
  return _accretiveModule;
}

export async function detectSpecialistDissent(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return [];
  const N = options.nThreshold ?? DEFAULT_N_THRESHOLD;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  try {
    const r = await pool.query(`
      SELECT
        voice->>'specialist' AS specialist,
        voice->>'verdict' AS verdict,
        COUNT(*)::int AS n,
        ARRAY_AGG(d.id ORDER BY d.ts) AS deliberation_ids,
        MIN(d.ts) AS first_seen_at,
        MAX(d.ts) AS last_seen_at
      FROM deliberations d, jsonb_array_elements(d.voices) AS voice
      WHERE d.ts > NOW() - ($1 || ' minutes')::interval
        AND voice->>'verdict' NOT IN ('abstain', 'hold')
        AND voice->>'verdict' != d.adjudication->>'verdict'
      GROUP BY voice->>'specialist', voice->>'verdict'
      HAVING COUNT(*) >= $2`,
      [String(win), N],
    );
    return r.rows || [];
  } catch (e) {
    console.error(`[observer:specialist-dissent] query failed: ${e.message}`);
    return [];
  }
}

async function _isInCooldown(pool, canonicalPath, cooldownMinutes) {
  try {
    const r = await pool.query(
      `SELECT 1 FROM accretions WHERE canonical_path = $1
        AND provenance_class = 'coach_provisional'
        AND appended_at > NOW() - ($2 || ' minutes')::interval LIMIT 1`,
      [canonicalPath, String(cooldownMinutes)],
    );
    return r.rows.length > 0;
  } catch { return false; }
}

export async function runSpecialistDissentObserver(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return { detected: 0, emitted: 0, skipped: 0, errors: 0 };
  let appendAccretion = options.appendAccretion;
  if (!appendAccretion) {
    const mod = await _loadAccretive();
    if (!mod) return { detected: 0, emitted: 0, skipped: 0, errors: 1, reason: '@accretive-substrate/accretive unavailable' };
    appendAccretion = mod.appendAccretion;
  }

  const detections = await detectSpecialistDissent(options);
  let emitted = 0, skipped = 0, errors = 0;
  const cooldown = options.cooldownMinutes ?? COOLDOWN_MINUTES;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  for (const d of detections) {
    const path = `gate-def:${d.specialist}-weight`;
    if (await _isInCooldown(pool, path, cooldown)) { skipped++; continue; }
    const fact = `Specialist ${d.specialist} dissented ${d.verdict} ${d.n} times in last ${win}min against majority — coach proposes weight recalibration`;
    const result = await appendAccretion({
      canonical_path: path,
      operator: 'coach',
      fact,
      provenance_class: 'coach_provisional',
      operator_confirmed: false,
      raw: {
        evidence_refs: {
          deliberation_ids: d.deliberation_ids.map(Number),
          n_occurrences: d.n,
          window: `${win}min`,
          first_seen_at: d.first_seen_at,
          last_seen_at: d.last_seen_at,
          specialist: d.specialist,
          dissent_verdict: d.verdict,
        },
        observer: 'specialist-dissent',
        observer_version: '1.0.0',
      },
    });
    if (result.ok) emitted++; else errors++;
  }
  return { detected: detections.length, emitted, skipped, errors };
}
