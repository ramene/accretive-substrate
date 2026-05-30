/**
 * @accretive-substrate/deliberation/observers/verdict-flip-flop
 *
 * Detects per-symbol verdict instability. Pattern: same symbol with BOTH
 * buy and sell verdicts in the same 30min window, total >= 4 deliberations.
 *
 * Distinct from per-symbol-drift (consistent direction); this surfaces
 * directional whipsaw that indicates strategy clarification is needed.
 * Emits a `per-symbol:<symbol>` accretion noting the instability.
 */

import { getPool } from '../store.mjs';

const DEFAULT_N_THRESHOLD = 4;
const DEFAULT_WINDOW_MINUTES = 30;
const COOLDOWN_MINUTES = 30;

let _accretiveModule = null;
async function _loadAccretive() {
  if (_accretiveModule) return _accretiveModule;
  try { _accretiveModule = await import('@accretive-substrate/accretive'); } catch { _accretiveModule = null; }
  return _accretiveModule;
}

export async function detectVerdictFlipFlop(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return [];
  const N = options.nThreshold ?? DEFAULT_N_THRESHOLD;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  try {
    const r = await pool.query(`
      SELECT
        symbol,
        COUNT(*)::int AS n,
        COUNT(DISTINCT adjudication->>'verdict')::int AS distinct_verdicts,
        ARRAY_AGG(id ORDER BY ts) AS deliberation_ids,
        MIN(ts) AS first_seen_at,
        MAX(ts) AS last_seen_at,
        ARRAY_AGG(DISTINCT adjudication->>'verdict') AS verdict_set
      FROM deliberations
      WHERE ts > NOW() - ($1 || ' minutes')::interval
        AND symbol IS NOT NULL
        AND adjudication->>'verdict' IN ('buy', 'sell')
      GROUP BY symbol
      HAVING COUNT(*) >= $2
         AND COUNT(DISTINCT adjudication->>'verdict') > 1`,
      [String(win), N],
    );
    return r.rows || [];
  } catch (e) {
    console.error(`[observer:verdict-flip-flop] query failed: ${e.message}`);
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

export async function runVerdictFlipFlopObserver(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return { detected: 0, emitted: 0, skipped: 0, errors: 0 };
  let appendAccretion = options.appendAccretion;
  let perSymbolPath = options.perSymbolPath;
  if (!appendAccretion || !perSymbolPath) {
    const mod = await _loadAccretive();
    if (!mod) return { detected: 0, emitted: 0, skipped: 0, errors: 1, reason: '@accretive-substrate/accretive unavailable' };
    appendAccretion = appendAccretion || mod.appendAccretion;
    perSymbolPath = perSymbolPath || mod.perSymbolPath;
  }

  const detections = await detectVerdictFlipFlop(options);
  let emitted = 0, skipped = 0, errors = 0;
  const cooldown = options.cooldownMinutes ?? COOLDOWN_MINUTES;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  for (const d of detections) {
    const path = perSymbolPath(d.symbol);
    if (await _isInCooldown(pool, path, cooldown)) { skipped++; continue; }
    const fact = `Verdict flip-flop on ${d.symbol}: ${d.n} deliberations in last ${win}min with both ${d.verdict_set.join(' AND ')} — strategy clarification recommended`;
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
          distinct_verdicts: d.distinct_verdicts,
          verdict_set: d.verdict_set,
          window: `${win}min`,
          first_seen_at: d.first_seen_at,
          last_seen_at: d.last_seen_at,
        },
        observer: 'verdict-flip-flop',
        observer_version: '1.0.0',
      },
    });
    if (result.ok) emitted++; else errors++;
  }
  return { detected: detections.length, emitted, skipped, errors };
}
