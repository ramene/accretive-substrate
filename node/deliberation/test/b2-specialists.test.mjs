/**
 * B2.Node specialist tests. Each specialist gets a dedicated suite covering
 * its happy path, abstain conditions, and bounds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empiricalPriorSpecialist } from '../src/specialists/empirical-prior.mjs';
import { cryptoMajorsSpecialist } from '../src/specialists/crypto-majors.mjs';
import { equitiesSpecialist } from '../src/specialists/equities.mjs';
import { memesSpecialist } from '../src/specialists/memes.mjs';
import { defiSpecialist } from '../src/specialists/defi.mjs';
import { polymarketSpecialist } from '../src/specialists/polymarket.mjs';

// ─── empirical-prior ──────────────────────────────────────────────────────

test('empirical-prior: strong bear (low WR + negative median) → sell', async () => {
  const v = await empiricalPriorSpecialist({
    trigger: { kind: 'buy_proposal' },
    empirical_priors: { h24: { n: 12, win_rate_pct: 22, median_pct: -1.4 } },
  });
  assert.equal(v.verdict, 'sell');
  assert.ok(v.confidence > 0.6);
});

test('empirical-prior: strong bull → buy', async () => {
  const v = await empiricalPriorSpecialist({
    trigger: { kind: 'buy_proposal' },
    empirical_priors: { h24: { n: 18, win_rate_pct: 78, median_pct: 1.2 } },
  });
  assert.equal(v.verdict, 'buy');
});

test('empirical-prior: n < 5 → abstain', async () => {
  const v = await empiricalPriorSpecialist({
    trigger: { kind: 'buy_proposal' },
    empirical_priors: { h24: { n: 3, win_rate_pct: 20, median_pct: -2 } },
  });
  assert.equal(v.verdict, 'abstain');
});

test('empirical-prior: neutral → hold', async () => {
  const v = await empiricalPriorSpecialist({
    trigger: { kind: 'buy_proposal' },
    empirical_priors: { h24: { n: 10, win_rate_pct: 52, median_pct: 0.1 } },
  });
  assert.equal(v.verdict, 'hold');
});

// ─── crypto-majors ───────────────────────────────────────────────────────

test('crypto-majors: BTC + healthy funding + trend up → buy', async () => {
  const v = await cryptoMajorsSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'kucoin' },
    market_state: { funding_rate: 0.0008, change_24h_pct: 2.4 },
  });
  assert.equal(v.verdict, 'buy');
});

test('crypto-majors: negative funding → sell', async () => {
  const v = await cryptoMajorsSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'binance' },
    market_state: { funding_rate: -0.0005, change_24h_pct: -1 },
  });
  assert.equal(v.verdict, 'sell');
});

test('crypto-majors: non-major symbol → abstain', async () => {
  const v = await cryptoMajorsSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'PEPE-USDT', venue: 'kucoin' },
    market_state: { funding_rate: 0.001, change_24h_pct: 5 },
  });
  assert.equal(v.verdict, 'abstain');
});

test('crypto-majors: wrong venue → abstain', async () => {
  const v = await cryptoMajorsSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'alpaca' },
    market_state: {},
  });
  assert.equal(v.verdict, 'abstain');
});

// ─── equities ────────────────────────────────────────────────────────────

test('equities: strong sector + RS → buy', async () => {
  const v = await equitiesSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'NVDA', venue: 'alpaca' },
    market_state: { sector_strength: 0.8, symbol_rs: 1.2, drawdown_pct: 0 },
  });
  assert.equal(v.verdict, 'buy');
});

test('equities: closed market → abstain', async () => {
  const v = await equitiesSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'NVDA', venue: 'alpaca' },
    market_state: { session: 'closed' },
  });
  assert.equal(v.verdict, 'abstain');
});

test('equities: drawdown > 5% → sell', async () => {
  const v = await equitiesSpecialist({
    trigger: { kind: 'sell_reeval', symbol: 'NVDA', venue: 'alpaca' },
    market_state: { sector_strength: 0.5, symbol_rs: 0.9, drawdown_pct: 8 },
  });
  assert.equal(v.verdict, 'sell');
});

// ─── memes ───────────────────────────────────────────────────────────────

test('memes: high velocity + chatter → buy', async () => {
  const v = await memesSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'PEPE-USDT', venue: 'kucoin' },
    market_state: { volume_velocity: 4.2, kol_mentions_1h: 6 },
  });
  assert.equal(v.verdict, 'buy');
});

test('memes: parabolic velocity → sell', async () => {
  const v = await memesSpecialist({
    trigger: { kind: 'sell_reeval', symbol: 'PEPE-USDT', venue: 'kucoin' },
    market_state: { volume_velocity: 7.5, kol_mentions_1h: 4 },
  });
  assert.equal(v.verdict, 'sell');
});

test('memes: non-meme symbol → abstain', async () => {
  const v = await memesSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'kucoin' },
    market_state: { volume_velocity: 8, kol_mentions_1h: 5 },
  });
  assert.equal(v.verdict, 'abstain');
});

// ─── defi ────────────────────────────────────────────────────────────────

test('defi: high APR + TVL → buy', async () => {
  const v = await defiSpecialist({
    trigger: { kind: 'buy_proposal', venue: 'aerodrome' },
    market_state: { pool_apr_pct: 80, tvl_usd: 5_000_000 },
  });
  assert.equal(v.verdict, 'buy');
});

test('defi: arb spread → buy', async () => {
  const v = await defiSpecialist({
    trigger: { kind: 'buy_proposal', venue: 'aerodrome' },
    market_state: { pool_apr_pct: 30, arb_spread_pct: 2.1 },
  });
  assert.equal(v.verdict, 'buy');
});

test('defi: IL on sell_reeval → sell', async () => {
  const v = await defiSpecialist({
    trigger: { kind: 'sell_reeval', venue: 'aerodrome' },
    market_state: { pool_apr_pct: 40, impermanent_loss_pct: 12 },
  });
  assert.equal(v.verdict, 'sell');
});

test('defi: wrong venue → abstain', async () => {
  const v = await defiSpecialist({
    trigger: { kind: 'buy_proposal', venue: 'kucoin' },
    market_state: { pool_apr_pct: 80 },
  });
  assert.equal(v.verdict, 'abstain');
});

// ─── polymarket ──────────────────────────────────────────────────────────

test('polymarket: positive odds shift + volume → buy', async () => {
  const v = await polymarketSpecialist({
    trigger: { kind: 'buy_proposal', venue: 'polymarket' },
    market_state: { odds_shift_24h_pp: 8.4, volume_24h_usd: 250_000, time_to_resolution_days: 7 },
  });
  assert.equal(v.verdict, 'buy');
});

test('polymarket: negative odds shift → sell', async () => {
  const v = await polymarketSpecialist({
    trigger: { kind: 'sell_reeval', venue: 'polymarket' },
    market_state: { odds_shift_24h_pp: -8.2, volume_24h_usd: 150_000 },
  });
  assert.equal(v.verdict, 'sell');
});

test('polymarket: near resolution + high volatility → sell', async () => {
  const v = await polymarketSpecialist({
    trigger: { kind: 'sell_reeval', venue: 'polymarket' },
    market_state: {
      odds_shift_24h_pp: 1, volume_24h_usd: 100_000,
      time_to_resolution_days: 0.4, odds_volatility_pct: 28,
    },
  });
  assert.equal(v.verdict, 'sell');
});

test('polymarket: wrong venue → abstain', async () => {
  const v = await polymarketSpecialist({
    trigger: { kind: 'buy_proposal', venue: 'kucoin' },
    market_state: { odds_shift_24h_pp: 10 },
  });
  assert.equal(v.verdict, 'abstain');
});
