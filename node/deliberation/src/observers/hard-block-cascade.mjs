/**
 * @accretive-substrate/deliberation/observers/hard-block-cascade
 *
 * Detects gates that hard-block deliberations repeatedly. Pattern: same
 * gate name appearing in guardrail_result.hard_blocks N+ times in 30min.
 * Emits a `gate-def:<gate>` accretion suggesting threshold review.
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

export async function detectHardBlockCascade(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return [];
  const N = options.nThreshold ?? DEFAULT_N_THRESHOLD;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  try {
    const r = await pool.query(`
      SELECT
        block_name,
        COUNT(*)::int AS n,
        ARRAY_AGG(d.id ORDER BY d.ts) AS deliberation_ids,
        MIN(d.ts) AS first_seen_at,
        MAX(d.ts) AS last_seen_at
      FROM deliberations d, jsonb_array_elements_text(d.guardrail_result->'hard_blocks') AS block_name
      WHERE d.ts > NOW() - ($1 || ' minutes')::interval
        AND d.final_verdict = 'abort'
      GROUP BY block_name
      HAVING COUNT(*) >= $2`,
      [String(win), N],
    );
    return r.rows || [];
  } catch (e) {
    console.error(`[observer:hard-block-cascade] query failed: ${e.message}`);
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

export async function runHardBlockCascadeObserver(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return { detected: 0, emitted: 0, skipped: 0, errors: 0 };
  let appendAccretion = options.appendAccretion;
  if (!appendAccretion) {
    const mod = await _loadAccretive();
    if (!mod) return { detected: 0, emitted: 0, skipped: 0, errors: 1, reason: '@accretive-substrate/accretive unavailable' };
    appendAccretion = mod.appendAccretion;
  }

  const detections = await detectHardBlockCascade(options);
  let emitted = 0, skipped = 0, errors = 0;
  const cooldown = options.cooldownMinutes ?? COOLDOWN_MINUTES;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  for (const d of detections) {
    const path = `gate-def:${d.block_name}`;
    if (await _isInCooldown(pool, path, cooldown)) { skipped++; continue; }
    const fact = `Gate ${d.block_name} hard-blocked ${d.n} times in last ${win}min — coach proposes threshold/override review`;
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
          gate_id: d.block_name,
        },
        observer: 'hard-block-cascade',
        observer_version: '1.0.0',
      },
    });
    if (result.ok) emitted++; else errors++;
  }
  return { detected: detections.length, emitted, skipped, errors };
}
