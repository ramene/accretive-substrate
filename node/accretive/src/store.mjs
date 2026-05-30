/**
 * @accretive-substrate/accretive — PG-backed store.
 *
 * Graceful degradation: every read returns [] when DB unreachable, every
 * write logs + swallows. The accretive read path is NEVER allowed to block
 * a trade decision — consumers treat an empty accretion list as "no
 * accretive overrides apply", same as the cold-start state.
 *
 * Why: at full sleep we have no DB at all. The kids must continue to work
 * when accretive context is unavailable (per spec §4 Q4 "consumer should
 * proceed with canonical-only behavior, log MISS").
 */

import pg from 'pg';
import { validateAccretion, withDefaults } from './schema.mjs';

const READ_LIMIT_DEFAULT = 32;
const READ_TIMEOUT_MS = 1500;

let _pool = null;

function _connectionString() {
  return (
    process.env.MAE_ACCRETIVE_PG_URL ||
    process.env.MAE_CONFIG_PG_URL ||
    process.env.DATABASE_URL ||
    null
  );
}

function _getPool() {
  if (_pool) return _pool;
  const cs = _connectionString();
  if (!cs) return null;
  try {
    _pool = new pg.Pool({
      connectionString: cs,
      max: parseInt(process.env.MAE_POOL_MAX_ACCRETIVE, 10) || 2,
      ssl: cs.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: READ_TIMEOUT_MS,
      idleTimeoutMillis: 30_000,
    });
    _pool.on('error', (err) => {
      console.error(`[accretive] pool error: ${err.message}`);
    });
  } catch (e) {
    console.error(`[accretive] pool init failed: ${e.message}`);
    return null;
  }
  return _pool;
}

/**
 * Append a new accretion. Returns { id, ok, error } — never throws.
 *
 * Promotion: pass { provenance_class: 'operator_authored_realtime',
 * promotion_event_id: <provisional_id> } to record a confirmation. The
 * provisional row is NEVER updated.
 */
export async function appendAccretion(input) {
  const validated = validateAccretion(input);
  if (!validated.ok) {
    return { id: null, ok: false, error: `validation: ${validated.errors.join('; ')}` };
  }
  const row = withDefaults(input);
  const pool = _getPool();
  if (!pool) return { id: null, ok: false, error: 'pg-unavailable' };

  try {
    const r = await pool.query(
      `INSERT INTO accretions (
         canonical_path, scope_key, operator, fact,
         regime_context, venue_scope, capital_band, trigger_event,
         rollout_stage, funding_rate_threshold, liquidation_price_band,
         max_leverage_in_regime, circuit_breaker_action,
         provenance_class, backfill_source, operator_confirmed,
         promotion_event_id, raw
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         $9, $10, $11,
         $12, $13,
         $14, $15, $16,
         $17, $18
       ) RETURNING id, appended_at`,
      [
        row.canonical_path, row.scope_key || null, row.operator, row.fact,
        row.regime_context || null,
        row.venue_scope || null,
        row.capital_band || null,
        row.trigger_event || null,
        row.rollout_stage || null,
        row.funding_rate_threshold ?? null,
        row.liquidation_price_band || null,
        row.max_leverage_in_regime ?? null,
        row.circuit_breaker_action || null,
        row.provenance_class,
        row.backfill_source || null,
        row.operator_confirmed,
        row.promotion_event_id || null,
        row.raw || null,
      ]
    );
    // If promotion, stamp promoted_at on the provisional (the only allowed
    // mutation — and only on the provisional itself, not on the new row).
    if (row.promotion_event_id) {
      try {
        await pool.query(
          `UPDATE accretions
             SET promoted_at = NOW()
           WHERE id = $1 AND promoted_at IS NULL`,
          [row.promotion_event_id]
        );
      } catch (e) {
        console.warn(`[accretive] promotion stamp failed for id=${row.promotion_event_id}: ${e.message}`);
      }
    }
    return { id: r.rows[0].id, appended_at: r.rows[0].appended_at, ok: true };
  } catch (e) {
    console.error(`[accretive] append FAILED canonical_path=${row.canonical_path}: ${e.message}`);
    return { id: null, ok: false, error: e.message };
  }
}

/**
 * Get latest-N accretions for a canonical_path, ordered newest first.
 * Optional scope_key filter; pass null to get all rows for the path.
 *
 * Always returns array — empty on DB miss or schema mismatch (graceful
 * degradation, per spec §4 Q4).
 */
export async function getAccretions(canonicalPath, opts = {}) {
  if (!canonicalPath) return [];
  const pool = _getPool();
  if (!pool) return [];

  const limit = Math.min(Math.max(1, opts.limit || READ_LIMIT_DEFAULT), 256);
  const scopeKey = opts.scope_key ?? null;
  const includeUnconfirmed = opts.includeUnconfirmed === true;

  try {
    const params = [canonicalPath, limit];
    let sql = `SELECT * FROM accretions WHERE canonical_path = $1`;
    if (scopeKey !== null) {
      sql += ` AND (scope_key = $3 OR scope_key IS NULL)`;
      params.push(scopeKey);
    }
    if (!includeUnconfirmed) {
      sql += ` AND operator_confirmed = TRUE`;
    }
    sql += ` ORDER BY appended_at DESC LIMIT $2`;
    const r = await pool.query(sql, params);
    return r.rows || [];
  } catch (e) {
    console.error(`[accretive] read MISS canonical_path=${canonicalPath}: ${e.message}`);
    return [];
  }
}

/**
 * Latest single accretion (or null).
 */
export async function latestAccretion(canonicalPath, opts = {}) {
  const rows = await getAccretions(canonicalPath, { ...opts, limit: 1 });
  return rows[0] || null;
}

/**
 * Compact citation string for embedding in audit rows (<venue-monitor-service>
 * memory_cite field, brain prompt headers, etc.).
 *
 * Example:  "accretion#42:operator@2026-05-29T18:08Z"
 */
export function citationOf(accretion) {
  if (!accretion || !accretion.id) return null;
  const ts = accretion.appended_at instanceof Date
    ? accretion.appended_at.toISOString()
    : String(accretion.appended_at || '');
  const shortTs = ts.replace(/\.\d+Z$/, 'Z');
  return `accretion#${accretion.id}:${accretion.operator || '?'}@${shortTs}`;
}

/**
 * Shut down the pool — only called by long-running services during graceful
 * stop. Test harnesses call this to drain connections.
 */
export async function shutdown() {
  if (_pool) {
    try { await _pool.end(); } catch {}
    _pool = null;
  }
}
