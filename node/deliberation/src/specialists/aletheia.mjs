/**
 * @accretive-substrate/deliberation/specialists/aletheia
 *
 * Aletheia specialist. Reads per-source learned weights from the evidence
 * package (sourced from aletheia_weights table) and weights the signal
 * verdicts by source trust.
 *
 * Verdict rules (deterministic):
 *   - For each signal in evidence_package.signals, look up its source's
 *     learned weight. Weight × confidence × directional_alignment = signal score.
 *   - Sum across signals, normalize, vote with the aggregate direction.
 *   - Abstain if no signals, or if max source weight is below auto-block floor
 *     (0.45 per [[project_aletheia_auto_block_default]]).
 *   - The strict-floor behavior is how the paper's "aletheia teeth" claim
 *     becomes deliberative rather than gate-level.
 *
 * Cites: each signal + aletheia_weights row + any aletheia.weights accretions.
 *
 * Domain: 'all'.
 */

import { makeSpecialist, voteFor, abstainBecause } from './base.mjs';

export const ALETHEIA_SPECIALIST_NAME = 'aletheia';
const ALETHEIA_BLOCK_FLOOR = 0.45;

async function argue(pkg) {
  const signals = pkg.signals || [];
  const weights = pkg?.aletheia_state?.weights?.sources || {};
  const accretions = (pkg.accretions || []).filter(a => a.canonical_path === 'aletheia.weights');

  const citations = [
    { type: 'aletheia_weight', source_count: Object.keys(weights).length },
  ];
  for (const a of accretions) {
    citations.push({ type: 'accretion', id: a.id, canonical_path: a.canonical_path });
  }

  if (signals.length === 0) {
    return abstainBecause(ALETHEIA_SPECIALIST_NAME, 'no signals in evidence package');
  }
  if (Object.keys(weights).length === 0) {
    return abstainBecause(ALETHEIA_SPECIALIST_NAME, 'no aletheia weights available — DB miss');
  }

  // Score each signal by (weight × signal_confidence × direction_sign).
  // Direction_sign: bullish=+1, bearish=-1, neutral=0.
  let buyScore = 0;
  let sellScore = 0;
  let maxWeight = 0;
  const scoredSignals = [];

  for (const s of signals) {
    const w = Number(weights[s.source] ?? weights[String(s.source).toLowerCase()] ?? 0);
    if (w > maxWeight) maxWeight = w;
    const sigConf = Number(s.confidence) || 0;
    const dir = String(s.direction || '').toLowerCase();
    let dirSign = 0;
    if (dir.startsWith('bull') || dir === 'buy') dirSign = 1;
    else if (dir.startsWith('bear') || dir === 'sell') dirSign = -1;

    const contribution = w * sigConf * Math.abs(dirSign);
    if (dirSign > 0) buyScore += contribution;
    else if (dirSign < 0) sellScore += contribution;

    scoredSignals.push({ source: s.source, weight: w, sigConf, dir, contribution });
    citations.push({ type: 'signal', source: s.source, direction: dir, confidence: sigConf });
  }

  // Auto-block floor: if MAX source weight is below 0.45, all signals are untrusted
  // and we abstain (per [[project_aletheia_auto_block_default]] threshold).
  if (maxWeight < ALETHEIA_BLOCK_FLOOR) {
    return abstainBecause(
      ALETHEIA_SPECIALIST_NAME,
      `max source weight ${maxWeight.toFixed(2)} below auto-block floor ${ALETHEIA_BLOCK_FLOOR}`,
    );
  }

  const total = buyScore + sellScore;
  if (total === 0) {
    return voteFor(
      ALETHEIA_SPECIALIST_NAME, 'hold', 0.4,
      `signals all neutral or unrecognized direction (n=${signals.length})`, citations,
    );
  }

  const buyShare = buyScore / total;
  const sellShare = sellScore / total;
  const consensusConf = Math.min(0.95, Math.max(buyShare, sellShare));

  if (buyShare > 0.6) {
    return voteFor(
      ALETHEIA_SPECIALIST_NAME, 'buy', consensusConf,
      `${signals.length} signals, weighted buy share ${(buyShare*100).toFixed(0)}%, max weight ${maxWeight.toFixed(2)}`,
      citations,
    );
  }
  if (sellShare > 0.6) {
    return voteFor(
      ALETHEIA_SPECIALIST_NAME, 'sell', consensusConf,
      `${signals.length} signals, weighted sell share ${(sellShare*100).toFixed(0)}%, max weight ${maxWeight.toFixed(2)}`,
      citations,
    );
  }
  return voteFor(
    ALETHEIA_SPECIALIST_NAME, 'hold', 0.5,
    `mixed signal directions: buy ${(buyShare*100).toFixed(0)}% vs sell ${(sellShare*100).toFixed(0)}%`,
    citations,
  );
}

export const aletheiaSpecialist = makeSpecialist(ALETHEIA_SPECIALIST_NAME, ['all'], argue);
