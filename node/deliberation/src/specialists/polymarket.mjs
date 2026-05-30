/**
 * @accretive-substrate/deliberation/specialists/polymarket
 *
 * Polymarket specialist. Filters venue=polymarket; reads event odds shift
 * + market depth.
 *
 * Verdict rules:
 *   odds_shift_24h > +5pp + volume > $100k        → buy   (momentum + liquidity)
 *   odds_shift_24h < -5pp                          → sell  (event drifting away)
 *   time_to_resolution < 1d AND odds_volatility>20 → sell  (taking risk off near resolution)
 *   else                                            → hold
 *
 * Domain: 'polymarket'.
 */

import { makeSpecialist, voteFor, abstainBecause } from './base.mjs';

export const POLYMARKET_SPECIALIST_NAME = 'polymarket';

async function argue(pkg) {
  const venue = String(pkg?.trigger?.venue || '').toLowerCase();
  if (venue !== 'polymarket') {
    return abstainBecause(POLYMARKET_SPECIALIST_NAME, `venue=${venue} out of scope`);
  }

  const market = pkg?.market_state || {};
  const oddsShift = Number(market.odds_shift_24h_pp);
  const volume = Number(market.volume_24h_usd);
  const timeTo = Number(market.time_to_resolution_days);
  const oddsVol = Number(market.odds_volatility_pct);

  const citations = [{ type: 'signal', source: 'polymarket', market }];

  if (!Number.isFinite(oddsShift)) {
    return abstainBecause(POLYMARKET_SPECIALIST_NAME, 'no odds shift data');
  }

  // Near resolution + high volatility = take risk off.
  if (Number.isFinite(timeTo) && timeTo < 1 && Number.isFinite(oddsVol) && oddsVol > 20) {
    return voteFor(
      POLYMARKET_SPECIALIST_NAME, 'sell', Math.min(0.82, 0.6 + oddsVol / 100),
      `resolution in ${(timeTo*24).toFixed(1)}h + odds volatility ${oddsVol.toFixed(0)}% — risk off`,
      citations,
    );
  }

  // Strong momentum + liquidity = entry.
  if (oddsShift > 5 && Number.isFinite(volume) && volume > 100_000) {
    return voteFor(
      POLYMARKET_SPECIALIST_NAME, 'buy', Math.min(0.82, 0.55 + oddsShift / 30),
      `odds shifted +${oddsShift.toFixed(1)}pp on $${Math.round(volume/1000)}k 24h volume`,
      citations,
    );
  }

  // Event drifting away.
  if (oddsShift < -5) {
    return voteFor(
      POLYMARKET_SPECIALIST_NAME, 'sell', Math.min(0.82, 0.55 + Math.abs(oddsShift) / 30),
      `odds shifted ${oddsShift.toFixed(1)}pp — event drifting away`,
      citations,
    );
  }

  return voteFor(
    POLYMARKET_SPECIALIST_NAME, 'hold', 0.45,
    `shift ${oddsShift.toFixed(1)}pp volume ${Number.isFinite(volume) ? '$'+Math.round(volume/1000)+'k' : 'n/a'} — no decisive move`,
    citations,
  );
}

export const polymarketSpecialist = makeSpecialist(
  POLYMARKET_SPECIALIST_NAME,
  ['polymarket'],
  argue,
);
