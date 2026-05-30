/**
 * @accretive-substrate/deliberation/specialists/equities
 *
 * Equities specialist. Reads sector heatmap + price/volume state for
 * Alpaca-venue symbols.
 *
 * Verdict rules:
 *   sector_strength > 0.7 + symbol_rs > 1.0    → buy
 *   sector_strength < 0.3 OR drawdown > 5%      → sell
 *   market_closed                              → abstain (no edge during halt)
 *   else                                       → hold
 *
 * Domain: 'equities' (venue=alpaca).
 */

import { makeSpecialist, voteFor, abstainBecause } from './base.mjs';

export const EQUITIES_SPECIALIST_NAME = 'equities';

async function argue(pkg) {
  const venue = String(pkg?.trigger?.venue || '').toLowerCase();
  if (venue !== 'alpaca') {
    return abstainBecause(EQUITIES_SPECIALIST_NAME, `venue=${venue} out of scope`);
  }

  const market = pkg?.market_state || {};
  if (market.session === 'closed') {
    return abstainBecause(EQUITIES_SPECIALIST_NAME, 'equity market closed — no decision');
  }

  const sectorStrength = Number(market.sector_strength);
  const rs = Number(market.symbol_rs);
  const drawdown = Number(market.drawdown_pct);

  const citations = [{ type: 'signal', source: 'equities', market }];

  if (!Number.isFinite(sectorStrength) && !Number.isFinite(rs)) {
    return abstainBecause(EQUITIES_SPECIALIST_NAME, 'no sector/RS data in evidence');
  }

  if (sectorStrength > 0.7 && rs > 1.0) {
    return voteFor(
      EQUITIES_SPECIALIST_NAME, 'buy', Math.min(0.85, 0.6 + sectorStrength * 0.2),
      `sector strong ${sectorStrength.toFixed(2)} + RS ${rs.toFixed(2)}`,
      citations,
    );
  }

  if (sectorStrength < 0.3 || drawdown > 5) {
    return voteFor(
      EQUITIES_SPECIALIST_NAME, 'sell', Math.min(0.85, 0.6 + (drawdown > 5 ? drawdown / 20 : 0.1)),
      `sector weak ${sectorStrength.toFixed(2)} or drawdown ${drawdown.toFixed(1)}%`,
      citations,
    );
  }

  return voteFor(
    EQUITIES_SPECIALIST_NAME, 'hold', 0.5,
    `sector ${sectorStrength.toFixed(2)} RS ${Number.isFinite(rs) ? rs.toFixed(2) : 'n/a'} — neutral`,
    citations,
  );
}

export const equitiesSpecialist = makeSpecialist(
  EQUITIES_SPECIALIST_NAME,
  ['equities'],
  argue,
);
