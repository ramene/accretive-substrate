/**
 * @accretive-substrate/accretive — Canonical-path helpers.
 *
 * canonical_path is the logical identifier consumers query by. The format is
 * `<artifact_type>` for global artifacts and `<artifact_type>:<id>` for the
 * parametric ones.
 *
 * Five live artifact types in the platform today (5 sidecars per spec §1.b):
 *   - aletheia.weights                  global, P0
 *   - regime-preset:<regime>            per-regime, P1
 *   - gate-def:<gate_id>                per-gate, P1
 *   - strategy-doc:<doc>                per-doc, P1
 *   - per-symbol:<symbol>               per-symbol, P1
 *
 * Helpers below are intentionally just string builders — no validation
 * against a registry, because new artifact types are expected to land.
 * Consumers that want strict validation should compare against the constants.
 */

export const ARTIFACT_TYPES = Object.freeze({
  ALETHEIA_WEIGHTS: 'aletheia.weights',
  REGIME_PRESET: 'regime-preset',
  GATE_DEF: 'gate-def',
  STRATEGY_DOC: 'strategy-doc',
  PER_SYMBOL: 'per-symbol',
});

export function aletheiaWeightsPath() {
  return ARTIFACT_TYPES.ALETHEIA_WEIGHTS;
}

export function regimePresetPath(regime) {
  if (!regime) throw new Error('regimePresetPath: regime required');
  return `${ARTIFACT_TYPES.REGIME_PRESET}:${regime}`;
}

export function gateDefPath(gateId) {
  if (!gateId) throw new Error('gateDefPath: gateId required');
  return `${ARTIFACT_TYPES.GATE_DEF}:${gateId}`;
}

export function strategyDocPath(doc) {
  if (!doc) throw new Error('strategyDocPath: doc required');
  return `${ARTIFACT_TYPES.STRATEGY_DOC}:${doc}`;
}

export function perSymbolPath(symbol) {
  if (!symbol) throw new Error('perSymbolPath: symbol required');
  return `${ARTIFACT_TYPES.PER_SYMBOL}:${symbol}`;
}

/**
 * Decompose a canonical_path back into {type, id}. id is null for global types.
 */
export function parseCanonicalPath(canonicalPath) {
  if (!canonicalPath || typeof canonicalPath !== 'string') {
    return { type: null, id: null };
  }
  const idx = canonicalPath.indexOf(':');
  if (idx < 0) return { type: canonicalPath, id: null };
  return { type: canonicalPath.slice(0, idx), id: canonicalPath.slice(idx + 1) };
}
