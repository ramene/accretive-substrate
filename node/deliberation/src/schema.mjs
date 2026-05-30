/**
 * @accretive-substrate/deliberation — schemas for evidence packages, voices, adjudication,
 * guardrail results, and final verdicts.
 *
 * These are NOT runtime-enforced (use validateX() helpers explicitly). The
 * authoritative enforcement is the PG `deliberations` CHECK constraints +
 * the operator-readable comments in migrations/shadow/0037_deliberation.sql.
 *
 * Shape stability is critical for Path B cross-language consistency: Go
 * implementation MUST produce voices/adjudication rows with identical
 * structure so the parity reporter can compare row distributions.
 */

// ─── Enums ─────────────────────────────────────────────────────────────────
export const TRIGGER_KINDS = Object.freeze([
  'buy_proposal',
  'sell_reeval',
  'stack_add',
  'divergence_investigation',
  'regime_transition',
  'gate_stack',
  'operator_request',
]);

export const VERDICTS = Object.freeze(['buy', 'sell', 'hold', 'abstain']);
export const FINAL_VERDICTS = Object.freeze(['execute', 'abort', 'operator_required', 'hold']);
export const SOURCE_PIPELINES = Object.freeze(['node', 'go']);

export const CITATION_TYPES = Object.freeze([
  'signal',
  'accretion',
  'past_trade',
  'gate_trace',
  'regime_state',
  'fng',
  'empirical_prior',
  'aletheia_weight',
  'brain_trace',
]);

// ─── Evidence package shape ────────────────────────────────────────────────
/**
 * Stage 1 output. The information all specialists see.
 *
 * @typedef {Object} EvidencePackage
 * @property {Object} trigger - {kind, symbol, venue, agent_id, ts, raw}
 * @property {Array}  signals - [{source, direction, confidence, ts, raw}]
 * @property {Array}  accretions - getAccretions() result, scoped to symbol+regime
 * @property {Array}  prior_trades - recent matching setups
 * @property {Object} gate_state - {active: [...], blocking: [...]}
 * @property {Object} regime_state - {regime, confidence, basket_status}
 * @property {Object} fng - {index, classification, ts}
 * @property {Object} brain_cascade_health - {tier1_ok, tier2_ok, tier3_ok, tier4_ok}
 * @property {Object} empirical_priors - relevant priors for signal pattern
 * @property {Object} proposed_position - {symbol, qty, estimated_dollar, agent_position_dollar_floor, agent_max_position_dollar}
 */

export function validateEvidencePackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== 'object') {
    return { ok: false, errors: ['evidence_package must be object'] };
  }
  if (!pkg.trigger || typeof pkg.trigger !== 'object') {
    errors.push('trigger required');
  } else {
    if (!TRIGGER_KINDS.includes(pkg.trigger.kind)) {
      errors.push(`trigger.kind must be one of ${TRIGGER_KINDS.join('|')}`);
    }
  }
  // Optional fields — specialists handle absence gracefully (returning abstain).
  for (const arr of ['signals', 'accretions', 'prior_trades']) {
    if (pkg[arr] !== undefined && !Array.isArray(pkg[arr])) {
      errors.push(`${arr} must be array if present`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// ─── Voice shape ──────────────────────────────────────────────────────────
/**
 * Each specialist returns one Voice. The set of voices is the input to the
 * adjudicator.
 *
 * @typedef {Object} Voice
 * @property {string} specialist - unique identifier
 * @property {string} verdict - one of VERDICTS
 * @property {number} confidence - 0..1
 * @property {string} rationale - human-readable justification
 * @property {Array<Citation>} citations - FK'd evidence rows
 * @property {string|null} abstained_because - non-null when verdict='abstain'
 */

export function validateVoice(v) {
  const errors = [];
  if (!v || typeof v !== 'object') return { ok: false, errors: ['voice must be object'] };
  if (!v.specialist) errors.push('specialist required');
  if (!VERDICTS.includes(v.verdict)) errors.push(`verdict must be one of ${VERDICTS.join('|')}`);
  if (typeof v.confidence !== 'number' || v.confidence < 0 || v.confidence > 1) {
    errors.push('confidence must be number 0..1');
  }
  if (typeof v.rationale !== 'string') errors.push('rationale must be string');
  if (!Array.isArray(v.citations)) errors.push('citations must be array');
  if (v.verdict === 'abstain' && !v.abstained_because) {
    errors.push('abstained_because required when verdict=abstain');
  }
  return { ok: errors.length === 0, errors };
}

// ─── Adjudication shape ───────────────────────────────────────────────────
/**
 * Stage 3 output.
 *
 * @typedef {Object} Adjudication
 * @property {string} verdict - one of VERDICTS (not abstain)
 * @property {number} confidence - weighted across non-abstain voices
 * @property {number} dissent_score - 0..1, how much disagreement
 * @property {Object} weight_distribution - {buy: w, sell: w, hold: w}
 * @property {boolean} brain_escalated - true if dissent triggered brain synthesis
 * @property {string|null} brain_synthesis - brain output if escalated
 * @property {Array<string>} dissent_log - which voices opposed the majority
 */

export function validateAdjudication(adj) {
  const errors = [];
  if (!adj || typeof adj !== 'object') return { ok: false, errors: ['adj must be object'] };
  if (!['buy', 'sell', 'hold'].includes(adj.verdict)) {
    errors.push('adjudication verdict must be buy|sell|hold (no abstain)');
  }
  if (typeof adj.confidence !== 'number') errors.push('confidence must be number');
  if (typeof adj.dissent_score !== 'number' || adj.dissent_score < 0 || adj.dissent_score > 1) {
    errors.push('dissent_score must be number 0..1');
  }
  if (typeof adj.brain_escalated !== 'boolean') errors.push('brain_escalated must be boolean');
  return { ok: errors.length === 0, errors };
}

// ─── Guardrail result shape ───────────────────────────────────────────────
/**
 * Stage 4 output.
 *
 * @typedef {Object} GuardrailResult
 * @property {boolean} passed - true if no hard blocks
 * @property {Array<string>} hard_blocks - gate ids that hard-blocked
 * @property {Array<Object>} soft_conflicts - [{accretion_id, fact, policy_applied}]
 * @property {number} exposure_threshold - $ value, per §10.5
 * @property {string} policy_applied - 'pause'|'flag'|'no_conflicts'
 */

export function validateGuardrailResult(r) {
  const errors = [];
  if (!r || typeof r !== 'object') return { ok: false, errors: ['result must be object'] };
  if (typeof r.passed !== 'boolean') errors.push('passed must be boolean');
  if (!Array.isArray(r.hard_blocks)) errors.push('hard_blocks must be array');
  if (!Array.isArray(r.soft_conflicts)) errors.push('soft_conflicts must be array');
  return { ok: errors.length === 0, errors };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
export function isOperatorRequiredVerdict(guardrail, adjudication) {
  if (!guardrail.passed) return false;  // hard-block = abort, not operator_required
  if (guardrail.policy_applied === 'pause') return true;
  return false;
}

export function finalVerdictFor(guardrail, adjudication) {
  if (!guardrail.passed) return 'abort';
  if (guardrail.policy_applied === 'pause') return 'operator_required';
  if (adjudication.verdict === 'hold') return 'hold';
  return 'execute';
}
