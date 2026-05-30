/**
 * @accretive-substrate/deliberation/store — PG access for the deliberations table.
 *
 * Same graceful-degradation contract as @accretive-substrate/accretive/store:
 *   - Read failure → return [] (caller proceeds with canonical-only behavior)
 *   - Write failure → return {ok: false, error: '...'} (caller logs + moves on)
 *   - NEVER throws; never blocks a trade decision.
 *
 * Connection string resolved from MAE_DELIBERATION_PG_URL ||
 * MAE_CONFIG_PG_URL || DATABASE_URL.
 */

import pg from 'pg';

const READ_TIMEOUT_MS = 1500;

let _pool = null;

function _connectionString() {
  return (
    process.env.MAE_DELIBERATION_PG_URL ||
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
      max: parseInt(process.env.MAE_POOL_MAX_DELIBERATION, 10) || 2,
      ssl: cs.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: READ_TIMEOUT_MS,
      idleTimeoutMillis: 30_000,
    });
    _pool.on('error', (err) => {
      console.error(`[deliberation] pool error: ${err.message}`);
    });
  } catch (e) {
    console.error(`[deliberation] pool init failed: ${e.message}`);
    return null;
  }
  return _pool;
}

/**
 * Insert a deliberation row. Returns {id, ts, ok} or {ok: false, error: '...'}.
 */
export async function insertDeliberation(row, options = {}) {
  const pool = options.pool || _getPool();
  if (!pool) return { id: null, ok: false, error: 'pg-unavailable' };

  try {
    const r = await pool.query(
      `INSERT INTO deliberations (
         source_pipeline, trigger_kind, symbol, venue, agent_id,
         evidence_package, voices, adjudication, guardrail_result,
         final_verdict, trade_ref, trade_ref_table,
         library_version, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12,
         $13, $14
       ) RETURNING id, ts`,
      [
        row.source_pipeline || 'node',
        row.trigger_kind,
        row.symbol || null,
        row.venue || null,
        row.agent_id || null,
        row.evidence_package,
        row.voices,
        row.adjudication,
        row.guardrail_result,
        row.final_verdict,
        row.trade_ref || null,
        row.trade_ref_table || null,
        row.library_version || '@accretive-substrate/deliberation@1.0.0',
        row.schema_version || 'v1',
      ],
    );
    return { id: r.rows[0].id, ts: r.rows[0].ts, ok: true };
  } catch (e) {
    console.error(`[deliberation] insert FAILED: ${e.message}`);
    return { id: null, ok: false, error: e.message };
  }
}

/**
 * Read deliberations newest first. Optional filters.
 */
export async function getDeliberations(opts = {}) {
  const pool = opts.pool || _getPool();
  if (!pool) return [];

  const limit = Math.min(Math.max(1, opts.limit || 50), 500);
  const conditions = [];
  const params = [limit];
  let i = 1;

  if (opts.symbol) { i++; conditions.push(`symbol = $${i}`); params.push(opts.symbol); }
  if (opts.source_pipeline) { i++; conditions.push(`source_pipeline = $${i}`); params.push(opts.source_pipeline); }
  if (opts.final_verdict) { i++; conditions.push(`final_verdict = $${i}`); params.push(opts.final_verdict); }
  if (opts.since) { i++; conditions.push(`ts >= $${i}`); params.push(opts.since); }
  if (opts.unack_only) conditions.push(`operator_acknowledged_at IS NULL AND final_verdict = 'operator_required'`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM deliberations ${where} ORDER BY ts DESC LIMIT $1`;

  try {
    const r = await pool.query(sql, params);
    return r.rows || [];
  } catch (e) {
    console.error(`[deliberation] getDeliberations failed: ${e.message}`);
    return [];
  }
}

/**
 * Record operator acknowledgement / action on a deliberation.
 */
export async function acknowledgeDeliberation(id, action, options = {}) {
  const pool = options.pool || _getPool();
  if (!pool) return { ok: false, error: 'pg-unavailable' };
  try {
    await pool.query(
      `UPDATE deliberations
          SET operator_acknowledged_at = NOW(), operator_action = $2
        WHERE id = $1`,
      [id, action || 'reviewed_only'],
    );
    return { ok: true };
  } catch (e) {
    console.error(`[deliberation] acknowledge failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

export async function shutdown() {
  if (_pool) {
    try { await _pool.end(); } catch {}
    _pool = null;
  }
}

/**
 * Public alias for observers and tests that need direct pool access.
 * Returns null when PG is unavailable (caller treats as graceful).
 */
export function getPool() {
  return _getPool();
}
