/**
 * @accretive-substrate/deliberation/observers/high-dissent-persistence
 *
 * Detects per-symbol persistent specialist disagreement. Pattern: same
 * symbol with dissent_score > 0.5 across N+ deliberations in 30min. Even
 * when the leader verdict is stable, persistent high dissent means the
 * specialists fundamentally disagree about how to treat this symbol.
 *
 * Emits a `per-symbol:<symbol>` accretion noting the persistent dissent
 * with avg score for operator review.
 */

import { getPool } from '../store.mjs';

const DEFAULT_N_THRESHOLD = 3;
const DEFAULT_DISSENT_THRESHOLD = 0.5;
const DEFAULT_WINDOW_MINUTES = 30;
const COOLDOWN_MINUTES = 30;

let _accretiveModule = null;
async function _loadAccretive() {
  if (_accretiveModule) return _accretiveModule;
  try { _accretiveModule = await import('@accretive-substrate/accretive'); } catch { _accretiveModule = null; }
  return _accretiveModule;
}

export async function detectHighDissentPersistence(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return [];
  const N = options.nThreshold ?? DEFAULT_N_THRESHOLD;
  const dissentFloor = options.dissentThreshold ?? DEFAULT_DISSENT_THRESHOLD;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  try {
    const r = await pool.query(`
      SELECT
        symbol,
        COUNT(*)::int AS n,
        AVG((adjudication->>'dissent_score')::float)::float AS avg_dissent,
        ARRAY_AGG(id ORDER BY ts) AS deliberation_ids,
        MIN(ts) AS first_seen_at,
        MAX(ts) AS last_seen_at
      FROM deliberations
      WHERE ts > NOW() - ($1 || ' minutes')::interval
        AND symbol IS NOT NULL
        AND (adjudication->>'dissent_score')::float > $3
      GROUP BY symbol
      HAVING COUNT(*) >= $2`,
      [String(win), N, dissentFloor],
    );
    return r.rows || [];
  } catch (e) {
    console.error(`[observer:high-dissent-persistence] query failed: ${e.message}`);
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

export async function runHighDissentPersistenceObserver(options = {}) {
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

  const detections = await detectHighDissentPersistence(options);
  let emitted = 0, skipped = 0, errors = 0;
  const cooldown = options.cooldownMinutes ?? COOLDOWN_MINUTES;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  for (const d of detections) {
    const path = perSymbolPath(d.symbol);
    if (await _isInCooldown(pool, path, cooldown)) { skipped++; continue; }
    const fact = `High persistent dissent on ${d.symbol}: ${d.n} deliberations in last ${win}min with avg dissent ${(d.avg_dissent || 0).toFixed(2)} — specialists fundamentally disagree, strategy review recommended`;
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
          avg_dissent_score: d.avg_dissent,
          window: `${win}min`,
          first_seen_at: d.first_seen_at,
          last_seen_at: d.last_seen_at,
        },
        observer: 'high-dissent-persistence',
        observer_version: '1.0.0',
      },
    });
    if (result.ok) emitted++; else errors++;
  }
  return { detected: detections.length, emitted, skipped, errors };
}
