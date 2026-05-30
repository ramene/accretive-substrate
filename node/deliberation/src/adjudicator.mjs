/**
 * @accretive-substrate/deliberation/adjudicator — Stage 3.
 *
 * Operator-mandated hybrid (§10.3 resolution 2026-05-29):
 *   - Default: weighted majority by specialist confidence
 *   - Escalate to brain synthesis when dissent_score exceeds threshold
 *   - Skip brain if it's unavailable (graceful)
 *
 * dissent_score is the share of contradicting confidence relative to total
 * non-abstain confidence. Threshold default 0.30 — meaning escalate when
 * 30%+ of total confidence opposes the leading verdict.
 *
 * Brain dependency is INJECTED via the brain option of adjudicate(). The
 * adjudicator never imports brain-cascade directly. This keeps the
 * package decoupled and testable.
 */

const DEFAULT_DISSENT_THRESHOLD = 0.30;

/**
 * @param {Array<Voice>} voices
 * @param {Object} options
 * @param {function(string): Promise<string|null>} [options.brain] - prompt → response
 * @param {number} [options.dissentThreshold] - 0..1
 * @returns {Promise<Adjudication>}
 */
export async function adjudicate(voices, options = {}) {
  const dissentThreshold = options.dissentThreshold ?? DEFAULT_DISSENT_THRESHOLD;
  const active = (voices || []).filter(v => v && v.verdict !== 'abstain');

  const weightDistribution = { buy: 0, sell: 0, hold: 0 };
  for (const v of active) {
    if (weightDistribution[v.verdict] !== undefined) {
      weightDistribution[v.verdict] += Number(v.confidence) || 0;
    }
  }

  const totalWeight = weightDistribution.buy + weightDistribution.sell + weightDistribution.hold;

  if (totalWeight === 0) {
    return {
      verdict: 'hold',
      confidence: 0,
      dissent_score: 0,
      weight_distribution: weightDistribution,
      brain_escalated: false,
      brain_synthesis: null,
      dissent_log: [],
      n_active_voices: active.length,
      n_total_voices: voices?.length || 0,
    };
  }

  // Leader = verdict with highest weight share.
  let leader = 'hold';
  let leaderWeight = weightDistribution.hold;
  for (const k of ['buy', 'sell']) {
    if (weightDistribution[k] > leaderWeight) {
      leader = k;
      leaderWeight = weightDistribution[k];
    }
  }

  // Dissent: total weight opposing the leader (not including hold).
  // The hold weight is treated as a non-dissent neutral mass.
  const dissentWeight =
    leader === 'buy' ? weightDistribution.sell :
    leader === 'sell' ? weightDistribution.buy :
    // leader=hold: dissent is whichever of buy/sell is non-zero
    weightDistribution.buy + weightDistribution.sell;

  const dissentScore = dissentWeight / Math.max(totalWeight, 1e-9);
  const leaderShare = leaderWeight / Math.max(totalWeight, 1e-9);

  const dissentLog = active
    .filter(v => v.verdict !== leader && v.verdict !== 'hold')
    .map(v => `${v.specialist}@${v.confidence.toFixed(2)}:${v.verdict}`);

  let brainEscalated = false;
  let brainSynthesis = null;

  if (dissentScore >= dissentThreshold && typeof options.brain === 'function') {
    brainEscalated = true;
    try {
      const prompt = _buildBrainPrompt(voices, weightDistribution, leader, leaderShare, dissentScore);
      brainSynthesis = await options.brain(prompt);
    } catch (e) {
      brainSynthesis = null;
      // Brain failure is non-fatal — we still return weighted-majority verdict.
    }
  }

  return {
    verdict: leader,
    confidence: leaderShare,
    dissent_score: dissentScore,
    weight_distribution: weightDistribution,
    brain_escalated: brainEscalated,
    brain_synthesis: brainSynthesis,
    dissent_log: dissentLog,
    n_active_voices: active.length,
    n_total_voices: voices?.length || 0,
  };
}

function _buildBrainPrompt(voices, dist, leader, leaderShare, dissent) {
  const lines = voices.map(v =>
    `  - ${v.specialist} (${v.verdict}, conf=${(v.confidence ?? 0).toFixed(2)}): ${v.rationale || ''}`
  ).join('\n');

  return `You are adjudicating a multi-specialist trading deliberation where the voices disagree.

VOICES:
${lines}

WEIGHTED DISTRIBUTION: buy=${dist.buy.toFixed(2)} sell=${dist.sell.toFixed(2)} hold=${dist.hold.toFixed(2)}
LEADER: ${leader} (share=${leaderShare.toFixed(2)})
DISSENT SCORE: ${dissent.toFixed(2)}

The leader-verdict majority is contested. Choose the final verdict (buy/sell/hold) considering:
1. Which dissenting voices have the strongest evidence?
2. Is the dissent of a kind that should override the majority, or noise that should be weighted down?

Respond ONLY in JSON: {"verdict":"buy|sell|hold","confidence":0..1,"explanation":"..."}`;
}

export { DEFAULT_DISSENT_THRESHOLD };
