/**
 * @accretive-substrate/deliberation/observers/per-symbol-drift
 *
 * Observer: scans recent deliberations for per-symbol verdict drift.
 *
 * Pattern: same `symbol × adjudication.verdict` appearing N times in a
 * sliding window. Per §10.4 operator resolution: N=3, window=30min, with
 * a 30-min per-canonical_path cooldown to avoid spam.
 *
 * On detection: emits a `coach_provisional` accretion at canonical_path
 * `per-symbol:<symbol>` with evidence_refs FK array (deliberation_ids,
 * n_occurrences, window, first_seen_at, last_seen_at).
 *
 * This is the production of the bridge: noise (every deliberation row)
 * becomes evidence (a coach_provisional accretion the operator can promote).
 */

import { getPool } from '../store.mjs';

// @accretive-substrate/accretive helpers are LAZILY imported on first use so this module
// loads in test environments where the workspace isn't pnpm-installed.
// Callers can also inject {appendAccretion, perSymbolPath} via options.
let _accretiveModule = null;
async function _loadAccretive() {
  if (_accretiveModule) return _accretiveModule;
  try {
    _accretiveModule = await import('@accretive-substrate/accretive');
  } catch {
    _accretiveModule = null;
  }
  return _accretiveModule;
}

const DEFAULT_N_THRESHOLD = 3;
const DEFAULT_WINDOW_MINUTES = 30;
const COOLDOWN_MINUTES = 30;

/**
 * Detect per-symbol drift patterns in the deliberations table.
 *
 * @param {Object} options
 * @param {Object} [options.pool] - PG pool override (tests)
 * @param {number} [options.nThreshold=3]
 * @param {number} [options.windowMinutes=30]
 * @param {number} [options.cooldownMinutes=30]
 * @returns {Promise<Array<{symbol, verdict, n, deliberation_ids, first_seen_at, last_seen_at}>>}
 */
export async function detectPerSymbolDrift(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return [];
  const N = options.nThreshold ?? DEFAULT_N_THRESHOLD;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  try {
    const r = await pool.query(`
      SELECT
        symbol,
        adjudication->>'verdict' AS verdict,
        COUNT(*)::int AS n,
        MIN(ts) AS first_seen_at,
        MAX(ts) AS last_seen_at,
        ARRAY_AGG(id ORDER BY ts) AS deliberation_ids
      FROM deliberations
      WHERE ts > NOW() - ($1 || ' minutes')::interval
        AND symbol IS NOT NULL
        AND adjudication->>'verdict' IN ('buy', 'sell')
      GROUP BY symbol, adjudication->>'verdict'
      HAVING COUNT(*) >= $2`,
      [String(win), N],
    );
    return r.rows || [];
  } catch (e) {
    console.error(`[observer:per-symbol-drift] query failed: ${e.message}`);
    return [];
  }
}

/**
 * Check whether a per-symbol drift accretion has been proposed recently —
 * implements the cooldown that prevents observer spam.
 */
async function _isInCooldown(pool, canonicalPath, cooldownMinutes) {
  try {
    const r = await pool.query(`
      SELECT 1 FROM accretions
       WHERE canonical_path = $1
         AND provenance_class = 'coach_provisional'
         AND appended_at > NOW() - ($2 || ' minutes')::interval
       LIMIT 1`,
      [canonicalPath, String(cooldownMinutes)],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Run the observer: detect drift patterns and emit one provisional
 * accretion per (symbol × verdict) cluster that's not in cooldown.
 *
 * Returns the list of accretions emitted (or attempted).
 */
export async function runPerSymbolDriftObserver(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return { detected: 0, emitted: 0, skipped: 0, errors: 0 };

  // Resolve accretive helpers (lazy import or test injection).
  let appendAccretion = options.appendAccretion;
  let perSymbolPath = options.perSymbolPath;
  if (!appendAccretion || !perSymbolPath) {
    const mod = await _loadAccretive();
    if (!mod) return { detected: 0, emitted: 0, skipped: 0, errors: 1, reason: '@accretive-substrate/accretive unavailable' };
    appendAccretion = appendAccretion || mod.appendAccretion;
    perSymbolPath = perSymbolPath || mod.perSymbolPath;
  }

  const drifts = await detectPerSymbolDrift(options);
  let emitted = 0;
  let skipped = 0;
  let errors = 0;
  const cooldown = options.cooldownMinutes ?? COOLDOWN_MINUTES;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  for (const drift of drifts) {
    const path = perSymbolPath(drift.symbol);
    if (await _isInCooldown(pool, path, cooldown)) {
      skipped++;
      continue;
    }
    const fact = `Verdict drift: ${drift.symbol} adjudicated ${drift.verdict} ${drift.n} times in last ${win}min — coach proposes per-symbol rule review`;
    const result = await appendAccretion({
      canonical_path: path,
      operator: 'coach',
      fact,
      provenance_class: 'coach_provisional',
      operator_confirmed: false,
      raw: {
        evidence_refs: {
          deliberation_ids: drift.deliberation_ids.map(Number),
          n_occurrences: drift.n,
          window: `${win}min`,
          first_seen_at: drift.first_seen_at,
          last_seen_at: drift.last_seen_at,
        },
        observer: 'per-symbol-drift',
        observer_version: '1.0.0',
      },
    });
    if (result.ok) {
      emitted++;
    } else {
      errors++;
    }
  }

  return { detected: drifts.length, emitted, skipped, errors };
}
