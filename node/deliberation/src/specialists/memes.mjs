/**
 * @accretive-substrate/deliberation/specialists/memes
 *
 * Memes specialist. Filters venue=kucoin AND symbol in memes list; reads
 * volume velocity + KOL chatter from the evidence package.
 *
 * Verdict rules:
 *   volume_velocity > 3.0 + KOL > 2 mentions  → buy   (sharp velocity + chatter)
 *   volume_velocity > 5.0                     → sell  (parabolic — take profit)
 *   no_velocity + no_chatter                  → abstain
 *   else                                      → hold
 *
 * Domain: kucoin/binance + symbol in memes list (DOGE, SHIB, PEPE, BONK, WIF, MEW, BOME, …).
 */

import { makeSpecialist, voteFor, abstainBecause } from './base.mjs';

export const MEMES_SPECIALIST_NAME = 'memes';
const MEMES = new Set([
  'DOGE', 'SHIB', 'PEPE', 'BONK', 'WIF', 'MEW', 'BOME', 'POPCAT',
  'PEPECOIN', 'FLOKI', 'BABYDOGE', 'TRUMP', 'BRETT', 'TURBO', 'PENGU',
]);

async function argue(pkg) {
  const venue = String(pkg?.trigger?.venue || '').toLowerCase();
  if (!['kucoin', 'binance'].includes(venue)) {
    return abstainBecause(MEMES_SPECIALIST_NAME, `venue=${venue} out of scope`);
  }

  const symbol = String(pkg?.trigger?.symbol || '');
  const base = symbol.split(/[-/]/)[0]?.toUpperCase();
  if (!MEMES.has(base)) {
    return abstainBecause(MEMES_SPECIALIST_NAME, `symbol ${symbol} not in memes scope`);
  }

  const market = pkg?.market_state?.[symbol] || pkg?.market_state || {};
  const velocity = Number(market.volume_velocity);
  const kolMentions = Number(market.kol_mentions_1h);

  const citations = [
    { type: 'signal', source: 'memes', symbol, velocity, kol_mentions_1h: kolMentions },
  ];

  if (!Number.isFinite(velocity) && !Number.isFinite(kolMentions)) {
    return abstainBecause(MEMES_SPECIALIST_NAME, 'no velocity/chatter data');
  }

  // Parabolic — take profit before reversion.
  if (velocity > 5.0) {
    return voteFor(
      MEMES_SPECIALIST_NAME, 'sell', Math.min(0.85, 0.65 + (velocity - 5) / 10),
      `parabolic velocity ${velocity.toFixed(1)}× — take profit before reversion`,
      citations,
    );
  }

  // Sharp velocity + chatter = entry.
  if (velocity > 3.0 && kolMentions > 2) {
    return voteFor(
      MEMES_SPECIALIST_NAME, 'buy', Math.min(0.85, 0.6 + velocity / 15 + kolMentions / 20),
      `velocity ${velocity.toFixed(1)}× + KOL chatter ${kolMentions} mentions/h`,
      citations,
    );
  }

  return voteFor(
    MEMES_SPECIALIST_NAME, 'hold', 0.45,
    `velocity ${Number.isFinite(velocity) ? velocity.toFixed(1)+'x' : 'n/a'} chatter ${Number.isFinite(kolMentions) ? kolMentions : 'n/a'}`,
    citations,
  );
}

export const memesSpecialist = makeSpecialist(
  MEMES_SPECIALIST_NAME,
  ['crypto'],
  argue,
);
