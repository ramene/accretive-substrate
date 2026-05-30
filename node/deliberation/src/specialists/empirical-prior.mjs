/**
 * @accretive-substrate/deliberation/specialists/empirical-prior
 *
 * Empirical-prior specialist. Reads forward-return distributions for the
 * current signal-source pattern from pkg.empirical_priors and emits a
 * verdict based on historical win-rate + median return at the 24h horizon.
 *
 * Data source: scripts/source-conflict-empirical.py output, the same
 * priors file coach.mjs::applyEmpiricalPriors() already consumes. The
 * orchestrator's assemble step (B2-future) will pre-compute the matching
 * pattern signature.
 *
 * Verdict rules (deterministic, mirrors coach's empirical-prior logic):
 *   pattern n >= 5, 24h WR < 35%, median < -0.5%   → sell (strong bear)
 *   pattern n >= 5, 24h WR > 65%, median >  0.5%   → buy  (strong bull)
 *   pattern n < 5                                  → abstain (insufficient)
 *   else                                           → hold  (no edge)
 *
 * Domain: 'all' — empirical priors apply to every venue.
 */

import { makeSpecialist, voteFor, abstainBecause } from './base.mjs';

export const EMPIRICAL_PRIOR_SPECIALIST_NAME = 'empirical-prior';
const MIN_N = 5;
const BEAR_WR_MAX = 35;
const BEAR_MEDIAN_MAX = -0.5;
const BULL_WR_MIN = 65;
const BULL_MEDIAN_MIN = 0.5;

async function argue(pkg) {
  const priors = pkg.empirical_priors;
  if (!priors || !priors.h24) {
    return abstainBecause(EMPIRICAL_PRIOR_SPECIALIST_NAME, 'no 24h prior in evidence');
  }
  const h24 = priors.h24;
  const n = Number(h24.n) || 0;
  const wr = Number(h24.win_rate_pct);
  const median = Number(h24.median_pct);

  const citations = [
    { type: 'empirical_prior', horizon: '24h', n, wr, median, pattern: priors.pattern || null },
  ];

  if (n < MIN_N) {
    return abstainBecause(
      EMPIRICAL_PRIOR_SPECIALIST_NAME,
      `n=${n} below ${MIN_N} sample floor`,
    );
  }

  if (wr < BEAR_WR_MAX && median < BEAR_MEDIAN_MAX) {
    const confidence = Math.min(0.92, 0.65 + (BEAR_WR_MAX - wr) / 100 + Math.abs(median) / 5);
    return voteFor(
      EMPIRICAL_PRIOR_SPECIALIST_NAME, 'sell', confidence,
      `empirical bear: n=${n}, 24h WR=${wr.toFixed(0)}%, median=${median.toFixed(2)}%`,
      citations,
    );
  }

  if (wr > BULL_WR_MIN && median > BULL_MEDIAN_MIN) {
    const confidence = Math.min(0.92, 0.65 + (wr - BULL_WR_MIN) / 100 + median / 5);
    return voteFor(
      EMPIRICAL_PRIOR_SPECIALIST_NAME, 'buy', confidence,
      `empirical bull: n=${n}, 24h WR=${wr.toFixed(0)}%, median=${median.toFixed(2)}%`,
      citations,
    );
  }

  return voteFor(
    EMPIRICAL_PRIOR_SPECIALIST_NAME, 'hold', 0.5,
    `pattern n=${n}, 24h WR=${wr.toFixed(0)}%, median=${median.toFixed(2)}% — no decisive edge`,
    citations,
  );
}

export const empiricalPriorSpecialist = makeSpecialist(
  EMPIRICAL_PRIOR_SPECIALIST_NAME,
  ['all'],
  argue,
);
