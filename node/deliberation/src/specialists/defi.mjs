/**
 * @accretive-substrate/deliberation/specialists/defi
 *
 * DeFi specialist. Filters venue in {aerodrome, uniswap}; reads pool APR
 * and arbitrage spread state.
 *
 * Verdict rules:
 *   pool_apr > 50% + tvl > $1M               → buy   (high-yield viable pool)
 *   arb_spread > 1.5%                         → buy   (arb opportunity)
 *   pool_apr < 5% + no_arb                    → hold  (no edge)
 *   impermanent_loss_pct > 8% (open position) → sell  (IL eating yield)
 *   else                                      → hold
 *
 * Domain: 'defi'.
 */

import { makeSpecialist, voteFor, abstainBecause } from './base.mjs';

export const DEFI_SPECIALIST_NAME = 'defi';

async function argue(pkg) {
  const venue = String(pkg?.trigger?.venue || '').toLowerCase();
  if (!['aerodrome', 'uniswap'].includes(venue)) {
    return abstainBecause(DEFI_SPECIALIST_NAME, `venue=${venue} out of scope`);
  }

  const market = pkg?.market_state || {};
  const apr = Number(market.pool_apr_pct);
  const tvl = Number(market.tvl_usd);
  const arbSpread = Number(market.arb_spread_pct);
  const il = Number(market.impermanent_loss_pct);

  const citations = [{ type: 'signal', source: 'defi', venue, market }];

  if (!Number.isFinite(apr) && !Number.isFinite(arbSpread)) {
    return abstainBecause(DEFI_SPECIALIST_NAME, 'no pool/arb data');
  }

  // Open position with significant IL — sell.
  if (pkg?.trigger?.kind === 'sell_reeval' && Number.isFinite(il) && il > 8) {
    return voteFor(
      DEFI_SPECIALIST_NAME, 'sell', Math.min(0.85, 0.6 + il / 30),
      `impermanent loss ${il.toFixed(1)}% eating yield`,
      citations,
    );
  }

  // High APR + tvl = entry.
  if (apr > 50 && tvl > 1_000_000) {
    return voteFor(
      DEFI_SPECIALIST_NAME, 'buy', Math.min(0.82, 0.6 + apr / 300),
      `pool APR ${apr.toFixed(0)}% + TVL $${(tvl/1e6).toFixed(1)}M`,
      citations,
    );
  }

  // Arb opportunity = entry.
  if (arbSpread > 1.5) {
    return voteFor(
      DEFI_SPECIALIST_NAME, 'buy', Math.min(0.80, 0.55 + arbSpread / 5),
      `arb spread ${arbSpread.toFixed(2)}% available`,
      citations,
    );
  }

  return voteFor(
    DEFI_SPECIALIST_NAME, 'hold', 0.45,
    `APR ${Number.isFinite(apr) ? apr.toFixed(0)+'%' : 'n/a'} arb ${Number.isFinite(arbSpread) ? arbSpread.toFixed(2)+'%' : 'n/a'} — no edge`,
    citations,
  );
}

export const defiSpecialist = makeSpecialist(DEFI_SPECIALIST_NAME, ['defi'], argue);
