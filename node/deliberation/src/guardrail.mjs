/**
 * @accretive-substrate/deliberation/guardrail — Stage 4 (the discipline floor).
 *
 * Two enforcement layers:
 *
 * 1. HARD blocks — gate registry says NO (e.g., capital halt, force-off,
 *    sit-out engaged, override active, source-conflict). These cause
 *    final_verdict='abort'. Read via the gates_active list in the
 *    evidence package's gate_state.
 *
 * 2. SOFT conflicts — an unconfirmed accretion says NO to this setup.
 *    Operator-mandated policy (§10.5, 2026-05-29):
 *      threshold = max(agent_position_dollar_floor × 2, $25)
 *      proposed_position.estimated_dollar > threshold → pause for operator
 *      proposed_position.estimated_dollar <= threshold → flag and proceed
 *
 * Returns {passed, hard_blocks, soft_conflicts, exposure_threshold, policy_applied}.
 */

const ABSOLUTE_PAUSE_FLOOR = 25;

export function enforceGuardrails(evidence, adjudication) {
  // Hard blocks from gate_state.
  const hardBlocks = Array.isArray(evidence?.gate_state?.blocking)
    ? evidence.gate_state.blocking.slice()
    : [];

  // Soft conflicts: unconfirmed accretions that argue against the
  // adjudicated verdict. We only consider buy/sell verdicts here (hold by
  // itself doesn't have a directional intent for accretions to oppose).
  const softConflicts = [];

  if (adjudication.verdict === 'buy' || adjudication.verdict === 'sell') {
    const unconfirmed = (evidence?.accretions || []).filter(a =>
      a && a.operator_confirmed === false
    );
    for (const a of unconfirmed) {
      // Naive opposition heuristic: presence of "NO BUY" / "BLOCK BUY" in
      // fact when proposed direction = buy. Real B2+ implementation
      // structures opposition via accretion directional fields. For B1
      // this is sufficient to exercise the policy machinery.
      const fact = String(a.fact || '').toLowerCase();
      const opposes =
        (adjudication.verdict === 'buy' &&
          (fact.includes('no buy') || fact.includes('block buy') || fact.includes('pause buys'))) ||
        (adjudication.verdict === 'sell' &&
          (fact.includes('no sell') || fact.includes('block sell') || fact.includes('hold position')));
      if (opposes) {
        softConflicts.push({
          accretion_id: a.id,
          canonical_path: a.canonical_path,
          fact: a.fact,
        });
      }
    }
  }

  // Threshold computation (operator-mandated §10.5).
  const floor = Number(
    evidence?.proposed_position?.agent_position_dollar_floor ?? 0,
  );
  const exposureThreshold = Math.max(floor * 2, ABSOLUTE_PAUSE_FLOOR);
  const proposedDollar = Number(evidence?.proposed_position?.estimated_dollar ?? 0);

  let policyApplied = 'no_conflicts';
  if (softConflicts.length > 0) {
    policyApplied = proposedDollar > exposureThreshold ? 'pause' : 'flag';
  }

  return {
    passed: hardBlocks.length === 0,
    hard_blocks: hardBlocks,
    soft_conflicts: softConflicts,
    exposure_threshold: exposureThreshold,
    proposed_dollar: proposedDollar,
    policy_applied: policyApplied,
  };
}
