/**
 * @accretive-substrate/accretive — Accretion schema (the 11 fields per spec §3 Q1).
 *
 * Each accretion is an append-only modification of a canonical artifact. The
 * canonical artifact (regime preset, gate def, aletheia weights, strategy doc,
 * per-symbol rule) is NEVER mutated — consumers read latest-N accretions for a
 * given canonical_path and apply them on top.
 *
 * Promotion contract (Q2 resolution): when a coach_provisional accretion is
 * operator-confirmed, append a NEW row with provenance_class =
 * 'operator_authored_realtime' and promotion_event_id pointing at the original.
 * The provisional row stays untouched.
 *
 * Schema validators below are intentionally lightweight — full PG CHECK
 * constraints are the canonical enforcement (see migrations/shadow/0035).
 */

export const PROVENANCE_CLASSES = Object.freeze([
  'operator_authored_realtime',
  'journal_distilled_backfill',
  'coach_provisional',
]);

export const CAPITAL_BANDS = Object.freeze([
  '10', '10_25', '25_50', '50_100', '100+',
]);

export const CIRCUIT_BREAKER_ACTIONS = Object.freeze([
  'halt', 'downsize', 'rebalance',
]);

/**
 * Required fields for every accretion:
 *   - canonical_path  (logical identifier)
 *   - operator        (author)
 *   - fact            (the rule/decision/observation)
 *   - provenance_class
 */
export function validateAccretion(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['input must be object'] };
  }

  // Required
  if (!input.canonical_path || typeof input.canonical_path !== 'string') {
    errors.push('canonical_path: required, string');
  }
  if (!input.operator || typeof input.operator !== 'string') {
    errors.push('operator: required, string');
  }
  if (!input.fact || typeof input.fact !== 'string') {
    errors.push('fact: required, string');
  }
  if (!PROVENANCE_CLASSES.includes(input.provenance_class)) {
    errors.push(`provenance_class: required, one of ${PROVENANCE_CLASSES.join('|')}`);
  }

  // Conditional: backfill_source REQUIRED when provenance_class is journal_distilled_backfill
  if (input.provenance_class === 'journal_distilled_backfill' && !input.backfill_source) {
    errors.push('backfill_source: required when provenance_class = journal_distilled_backfill');
  }

  // Optional bounded fields
  if (input.capital_band !== undefined && input.capital_band !== null &&
      !CAPITAL_BANDS.includes(input.capital_band)) {
    errors.push(`capital_band: must be one of ${CAPITAL_BANDS.join('|')} or null`);
  }
  if (input.circuit_breaker_action !== undefined && input.circuit_breaker_action !== null &&
      !CIRCUIT_BREAKER_ACTIONS.includes(input.circuit_breaker_action)) {
    errors.push(`circuit_breaker_action: must be one of ${CIRCUIT_BREAKER_ACTIONS.join('|')} or null`);
  }

  // JSONB sanity
  for (const jsonField of ['regime_context', 'venue_scope', 'liquidation_price_band', 'raw']) {
    if (input[jsonField] !== undefined && input[jsonField] !== null &&
        typeof input[jsonField] !== 'object') {
      errors.push(`${jsonField}: must be object/array/null`);
    }
  }

  // Numerics
  for (const numField of ['funding_rate_threshold', 'max_leverage_in_regime']) {
    if (input[numField] !== undefined && input[numField] !== null &&
        !Number.isFinite(Number(input[numField]))) {
      errors.push(`${numField}: must be finite number or null`);
    }
  }

  // operator_confirmed coupling: coach_provisional defaults to false; everything else to true.
  // Explicit false on operator_authored_realtime is allowed (rare — operator can mark dubious).
  if (input.provenance_class === 'coach_provisional' && input.operator_confirmed === true) {
    errors.push('coach_provisional accretions cannot be operator_confirmed=true at insert time (use promotion path)');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Apply defaults for INSERT.
 */
export function withDefaults(input) {
  const out = { ...input };
  if (out.operator_confirmed === undefined) {
    out.operator_confirmed = out.provenance_class !== 'coach_provisional';
  }
  return out;
}
