/**
 * @accretive-substrate/deliberation/observers/soft-conflict-cluster
 *
 * Detects accretion IDs appearing repeatedly in soft_conflicts. Pattern:
 * same `accretion_id` in guardrail_result.soft_conflicts N+ times in 30min.
 *
 * This is a PROMOTION SIGNAL — when an unconfirmed accretion is repeatedly
 * cited as a soft conflict, the operator should consider promoting it to
 * `operator_authored_realtime`. Emits a `strategy-doc:accretion-promotion`
 * accretion surfacing the referenced accretion ID for dashboard review.
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

export async function detectSoftConflictCluster(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return [];
  const N = options.nThreshold ?? DEFAULT_N_THRESHOLD;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  try {
    const r = await pool.query(`
      SELECT
        (conflict->>'accretion_id')::bigint AS accretion_id,
        conflict->>'canonical_path' AS conflict_canonical_path,
        COUNT(*)::int AS n,
        ARRAY_AGG(d.id ORDER BY d.ts) AS deliberation_ids,
        MIN(d.ts) AS first_seen_at,
        MAX(d.ts) AS last_seen_at
      FROM deliberations d, jsonb_array_elements(d.guardrail_result->'soft_conflicts') AS conflict
      WHERE d.ts > NOW() - ($1 || ' minutes')::interval
        AND conflict->>'accretion_id' IS NOT NULL
      GROUP BY accretion_id, conflict_canonical_path
      HAVING COUNT(*) >= $2`,
      [String(win), N],
    );
    return r.rows || [];
  } catch (e) {
    console.error(`[observer:soft-conflict-cluster] query failed: ${e.message}`);
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

export async function runSoftConflictClusterObserver(options = {}) {
  const pool = options.pool || getPool();
  if (!pool) return { detected: 0, emitted: 0, skipped: 0, errors: 0 };
  let appendAccretion = options.appendAccretion;
  if (!appendAccretion) {
    const mod = await _loadAccretive();
    if (!mod) return { detected: 0, emitted: 0, skipped: 0, errors: 1, reason: '@accretive-substrate/accretive unavailable' };
    appendAccretion = mod.appendAccretion;
  }

  const detections = await detectSoftConflictCluster(options);
  let emitted = 0, skipped = 0, errors = 0;
  const cooldown = options.cooldownMinutes ?? COOLDOWN_MINUTES;
  const win = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  for (const d of detections) {
    // Use a stable path that tracks ONE provisional accretion per source accretion id.
    const path = `strategy-doc:accretion-promotion-${d.accretion_id}`;
    if (await _isInCooldown(pool, path, cooldown)) { skipped++; continue; }
    const fact = `Accretion #${d.accretion_id} (${d.conflict_canonical_path || 'unknown path'}) cited as soft conflict ${d.n} times in last ${win}min — operator review for promotion to operator_authored_realtime`;
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
          referenced_accretion_id: Number(d.accretion_id),
          referenced_canonical_path: d.conflict_canonical_path,
        },
        observer: 'soft-conflict-cluster',
        observer_version: '1.0.0',
      },
    });
    if (result.ok) emitted++; else errors++;
  }
  return { detected: detections.length, emitted, skipped, errors };
}
