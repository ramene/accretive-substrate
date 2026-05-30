/**
 * @accretive-substrate/deliberation — public API.
 *
 * Three entry points cover 95% of usage:
 *   runDeliberation({evidence, source_pipeline}, options)
 *     → run the full 6-stage loop and persist
 *   getDeliberations({symbol, since, ...})
 *     → read recent deliberations (live tail, replay)
 *   acknowledgeDeliberation(id, action)
 *     → operator promote / dismiss / reviewed
 *
 * Specialist API in ./specialists/ for tests + B2 extensions.
 * Schema validators in ./schema.mjs.
 *
 * See packages/deliberation/README.md and
 * docs/PHASE-B-ACCRETIVE-DELIBERATION-SCOPE.md.
 */

export { runDeliberation } from './orchestrator.mjs';

export {
  insertDeliberation,
  getDeliberations,
  acknowledgeDeliberation,
  shutdown,
} from './store.mjs';

export {
  adjudicate,
  DEFAULT_DISSENT_THRESHOLD,
} from './adjudicator.mjs';

export {
  enforceGuardrails,
} from './guardrail.mjs';

export {
  callAllSpecialists,
  ACTIVE_SPECIALISTS,
  SPECIALIST_NAMES,
} from './specialists/registry.mjs';

export {
  makeSpecialist,
  abstainBecause,
  voteFor,
  matchesDomain,
} from './specialists/base.mjs';

export {
  TRIGGER_KINDS,
  VERDICTS,
  FINAL_VERDICTS,
  SOURCE_PIPELINES,
  CITATION_TYPES,
  validateEvidencePackage,
  validateVoice,
  validateAdjudication,
  validateGuardrailResult,
  finalVerdictFor,
  isOperatorRequiredVerdict,
} from './schema.mjs';
