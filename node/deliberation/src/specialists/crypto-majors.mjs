/**
 * @accretive-substrate/deliberation/specialists/crypto-majors
 *
 * Crypto-majors specialist. Reads venue-specific market state for major
 * crypto symbols (BTC, ETH, SOL, …) and emits verdict based on:
 *   - Funding rate (Binance futures) — flat-to-positive = healthy basis
 *   - Order book depth (KuCoin L2_20) — thicker = supports verdict
 *   - 24h trend direction + magnitude
 *
 * Verdict rules:
 *   funding > 0.05% AND 24h_chg > 1%   → buy   (healthy basis + trend up)
 *   funding < -0.03% OR 24h_chg < -3% → sell  (basis flipping bear OR sharp dump)
 *   else                              → hold  (no clear edge)
 *
 * Domain: crypto-majors (kucoin/binance + symbol in MAJORS list).
 */

import { makeSpecialist, voteFor, abstainBecause, matchesDomain } from './base.mjs';

export const CRYPTO_MAJORS_SPECIALIST_NAME = 'crypto-majors';
const MAJORS = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK']);

async function argue(pkg) {
  const venue = String(pkg?.trigger?.venue || '').toLowerCase();
  if (!['kucoin', 'binance'].includes(venue)) {
    return abstainBecause(CRYPTO_MAJORS_SPECIALIST_NAME, `venue=${venue} out of scope`);
  }

  const symbol = String(pkg?.trigger?.symbol || '');
  const base = symbol.split(/[-/]/)[0]?.toUpperCase();
  if (!MAJORS.has(base)) {
    return abstainBecause(CRYPTO_MAJORS_SPECIALIST_NAME, `symbol ${symbol} not a major`);
  }

  const market = pkg?.market_state?.[symbol] || pkg?.market_state || {};
  const fundingRate = Number(market.funding_rate);
  const chg24 = Number(market.change_24h_pct);
  const orderbookDepth = Number(market.orderbook_depth_usd);

  const citations = [
    { type: 'signal', source: 'crypto-majors', symbol, market: { funding_rate: fundingRate, change_24h_pct: chg24 } },
  ];

  if (!Number.isFinite(fundingRate) && !Number.isFinite(chg24)) {
    return abstainBecause(CRYPTO_MAJORS_SPECIALIST_NAME, 'no funding/24h data in evidence');
  }

  // Healthy basis + trend up.
  if (fundingRate > 0.0005 && chg24 > 1) {
    const conf = Math.min(0.85, 0.6 + chg24 / 20 + fundingRate * 100);
    return voteFor(
      CRYPTO_MAJORS_SPECIALIST_NAME, 'buy', conf,
      `funding ${(fundingRate*100).toFixed(3)}% + 24h ${chg24.toFixed(1)}%${Number.isFinite(orderbookDepth) ? ` + depth $${Math.round(orderbookDepth).toLocaleString()}` : ''}`,
      citations,
    );
  }

  // Bear basis or sharp dump.
  if (fundingRate < -0.0003 || chg24 < -3) {
    const reason = fundingRate < -0.0003
      ? `funding flipped negative ${(fundingRate*100).toFixed(3)}%`
      : `24h drop ${chg24.toFixed(1)}% > -3% threshold`;
    const conf = Math.min(0.85, 0.6 + Math.abs(chg24) / 25);
    return voteFor(CRYPTO_MAJORS_SPECIALIST_NAME, 'sell', conf, reason, citations);
  }

  return voteFor(
    CRYPTO_MAJORS_SPECIALIST_NAME, 'hold', 0.5,
    `funding ${Number.isFinite(fundingRate) ? (fundingRate*100).toFixed(3)+'%' : 'n/a'} 24h ${Number.isFinite(chg24) ? chg24.toFixed(1)+'%' : 'n/a'} — no clear edge`,
    citations,
  );
}

export const cryptoMajorsSpecialist = makeSpecialist(
  CRYPTO_MAJORS_SPECIALIST_NAME,
  ['crypto'],
  argue,
);
