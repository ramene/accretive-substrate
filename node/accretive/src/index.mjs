/**
 * @accretive-substrate/accretive — public API.
 *
 * Three calls do 95% of the work:
 *   appendAccretion(row)                 — author/promote
 *   getAccretions(canonical_path, opts)  — read latest-N (graceful on DB miss)
 *   citationOf(accretion)                — render compact memory_cite string
 *
 * Canonical-path builders live in ./canonical-paths.mjs. Schema validators
 * and provenance class enum live in ./schema.mjs.
 *
 * See packages/accretive/README.md for usage. See
 * docs/ACCRETIVE-RETROFIT-SPEC-2026-05-24.md for the design rationale.
 */

export {
  appendAccretion,
  getAccretions,
  latestAccretion,
  citationOf,
  shutdown,
} from './store.mjs';

export {
  PROVENANCE_CLASSES,
  CAPITAL_BANDS,
  CIRCUIT_BREAKER_ACTIONS,
  validateAccretion,
  withDefaults,
} from './schema.mjs';

export {
  ARTIFACT_TYPES,
  aletheiaWeightsPath,
  regimePresetPath,
  gateDefPath,
  strategyDocPath,
  perSymbolPath,
  parseCanonicalPath,
} from './canonical-paths.mjs';
