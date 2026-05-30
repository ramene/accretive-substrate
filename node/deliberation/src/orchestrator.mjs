/**
 * @accretive-substrate/deliberation/orchestrator — runDeliberation() entry point.
 *
 * Runs the 6-stage loop end-to-end:
 *   1. Assemble evidence package (caller may provide pre-built or we read
 *      from PG via @accretive-substrate/accretive + helpers passed in options)
 *   2. Call all active specialists in parallel
 *   3. Adjudicate voices (hybrid: weighted-majority + brain on dissent)
 *   4. Enforce guardrails (hard blocks + soft conflicts)
 *   5. Persist deliberation row + return result
 *   6. (Async) observer cron will detect patterns and emit provisional
 *      accretions in B3
 *
 * Graceful: if persistence fails, we still return the verdict so the
 * caller can proceed. PG read failures yield empty evidence subsets,
 * specialists abstain, adjudication still runs — never blocks a trade.
 *
 * Trigger surface (operator-mandated §10.2, 2026-05-29): caller decides
 * when to invoke. The library doesn't gate on confidence — that's the
 * orchestrator/coach wire-up's responsibility (B4).
 */

import { callAllSpecialists, ACTIVE_SPECIALISTS } from './specialists/registry.mjs';
import { adjudicate } from './adjudicator.mjs';
import { enforceGuardrails } from './guardrail.mjs';
import { insertDeliberation } from './store.mjs';
import { validateEvidencePackage, finalVerdictFor, SOURCE_PIPELINES } from './schema.mjs';

const LIBRARY_VERSION = '@accretive-substrate/deliberation@1.0.0';

/**
 * @param {Object} input
 * @param {EvidencePackage} input.evidence - pre-assembled (assemble.mjs will land in B2)
 * @param {string} input.source_pipeline - 'node' | 'go'
 *
 * @param {Object} options
 * @param {Array<function>} [options.specialists] - override for tests
 * @param {function(string): Promise<string|null>} [options.brain]
 * @param {number} [options.dissentThreshold]
 * @param {function(Object): Promise<Object>} [options.persist] - override insertDeliberation for tests
 *
 * @returns {Promise<{deliberation_id, final_verdict, adjudication, guardrail, voices, error?}>}
 */
export async function runDeliberation(input, options = {}) {
  // Validate input shape.
  if (!input || !input.evidence) {
    return { final_verdict: 'abort', error: 'no evidence package supplied' };
  }
  if (!SOURCE_PIPELINES.includes(input.source_pipeline)) {
    return { final_verdict: 'abort', error: 'invalid source_pipeline' };
  }

  const v = validateEvidencePackage(input.evidence);
  if (!v.ok) {
    return { final_verdict: 'abort', error: `evidence_package invalid: ${v.errors.join('; ')}` };
  }

  const evidence = input.evidence;

  // Stage 2 — call specialists in parallel.
  const specialists = options.specialists || ACTIVE_SPECIALISTS;
  const voices = await callAllSpecialists(evidence, specialists);

  // Stage 3 — adjudicate.
  const adjudication = await adjudicate(voices, {
    brain: options.brain,
    dissentThreshold: options.dissentThreshold,
  });

  // Stage 4 — guardrail.
  const guardrail = enforceGuardrails(evidence, adjudication);

  // Stage 5 — persist.
  const finalVerdict = finalVerdictFor(guardrail, adjudication);
  const row = {
    source_pipeline: input.source_pipeline,
    trigger_kind: evidence.trigger.kind,
    symbol: evidence.trigger.symbol || null,
    venue: evidence.trigger.venue || null,
    agent_id: evidence.trigger.agent_id || null,
    evidence_package: evidence,
    voices,
    adjudication,
    guardrail_result: guardrail,
    final_verdict: finalVerdict,
    trade_ref: input.trade_ref || null,
    trade_ref_table: input.trade_ref_table || null,
    library_version: LIBRARY_VERSION,
  };

  const persister = options.persist || insertDeliberation;
  let persistResult;
  try {
    persistResult = await persister(row);
  } catch (e) {
    persistResult = { ok: false, error: e.message };
  }

  return {
    deliberation_id: persistResult?.id || null,
    final_verdict: finalVerdict,
    adjudication,
    guardrail,
    voices,
    persisted: persistResult?.ok === true,
    persist_error: persistResult?.ok === true ? null : (persistResult?.error || 'unknown'),
  };
}
