import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regimeSpecialist } from '../src/specialists/regime.mjs';
import { aletheiaSpecialist } from '../src/specialists/aletheia.mjs';
import { makeSpecialist, abstainBecause, voteFor, matchesDomain } from '../src/specialists/base.mjs';

// ─── Regime specialist ────────────────────────────────────────────────────

test('regime: CRASH high-conf → hold', async () => {
  const v = await regimeSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'kucoin' },
    regime_state: { regime: 'CRASH', confidence: 0.85 },
  });
  assert.equal(v.verdict, 'hold');
  assert.ok(v.confidence > 0.7);
  assert.match(v.rationale, /CRASH/);
});

test('regime: BULL on buy_proposal → buy', async () => {
  const v = await regimeSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'kucoin' },
    regime_state: { regime: 'BULL', confidence: 0.8 },
  });
  assert.equal(v.verdict, 'buy');
});

test('regime: SIDEWAYS on buy_proposal → mean-reversion buy with discount', async () => {
  const v = await regimeSpecialist({
    trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'kucoin' },
    regime_state: { regime: 'SIDEWAYS', confidence: 0.82 },
  });
  assert.equal(v.verdict, 'buy');
  assert.ok(v.confidence < 0.82, 'confidence should be discounted from raw regime conf');
});

test('regime: low confidence → abstain', async () => {
  const v = await regimeSpecialist({
    trigger: { kind: 'buy_proposal' },
    regime_state: { regime: 'SIDEWAYS', confidence: 0.3 },
  });
  assert.equal(v.verdict, 'abstain');
  assert.ok(v.abstained_because);
});

test('regime: missing regime_state → abstain', async () => {
  const v = await regimeSpecialist({ trigger: { kind: 'buy_proposal' } });
  assert.equal(v.verdict, 'abstain');
});

test('regime: BEAR on sell_reeval → sell', async () => {
  const v = await regimeSpecialist({
    trigger: { kind: 'sell_reeval', symbol: 'BTC-USDT' },
    regime_state: { regime: 'BEAR', confidence: 0.75 },
  });
  assert.equal(v.verdict, 'sell');
});

test('regime: cites accretions matching the regime', async () => {
  const v = await regimeSpecialist({
    trigger: { kind: 'buy_proposal' },
    regime_state: { regime: 'SIDEWAYS', confidence: 0.82 },
    accretions: [
      // Direct regime-name match — should be cited.
      { id: 42, canonical_path: 'regime-preset:sideways', fact: 'apply mean-reversion bias' },
      // Per-symbol accretion — should NOT be cited by regime specialist (per-symbol
      // is the per-symbol specialist's beat in B2).
      { id: 99, canonical_path: 'per-symbol:BTC-USDT', fact: 'unrelated' },
    ],
  });
  const accretionCites = v.citations.filter(c => c.type === 'accretion');
  assert.equal(accretionCites.length, 1);
  assert.equal(accretionCites[0].id, 42);
});

// ─── Aletheia specialist ──────────────────────────────────────────────────

test('aletheia: no signals → abstain', async () => {
  const v = await aletheiaSpecialist({
    trigger: { kind: 'buy_proposal' },
    signals: [],
    aletheia_state: { weights: { sources: { 'kucoin-scanner': 0.6 } } },
  });
  assert.equal(v.verdict, 'abstain');
});

test('aletheia: max weight below 0.45 floor → abstain', async () => {
  const v = await aletheiaSpecialist({
    trigger: { kind: 'buy_proposal' },
    signals: [{ source: 'kucoin-scanner', direction: 'bullish', confidence: 0.7 }],
    aletheia_state: { weights: { sources: { 'kucoin-scanner': 0.4 } } },
  });
  assert.equal(v.verdict, 'abstain');
  assert.match(v.abstained_because, /below auto-block floor/);
});

test('aletheia: bullish majority → buy', async () => {
  const v = await aletheiaSpecialist({
    trigger: { kind: 'buy_proposal' },
    signals: [
      { source: 'kucoin-scanner', direction: 'bullish', confidence: 0.7 },
      { source: 'finnhub-news', direction: 'bullish', confidence: 0.65 },
      { source: 'finviz', direction: 'bearish', confidence: 0.5 },
    ],
    aletheia_state: { weights: { sources: {
      'kucoin-scanner': 0.6, 'finnhub-news': 0.55, 'finviz': 0.5,
    } } },
  });
  assert.equal(v.verdict, 'buy');
});

test('aletheia: mixed signals → hold', async () => {
  const v = await aletheiaSpecialist({
    trigger: { kind: 'buy_proposal' },
    signals: [
      { source: 'a', direction: 'bullish', confidence: 0.6 },
      { source: 'b', direction: 'bearish', confidence: 0.6 },
    ],
    aletheia_state: { weights: { sources: { a: 0.5, b: 0.5 } } },
  });
  assert.equal(v.verdict, 'hold');
});

// ─── Base helpers ─────────────────────────────────────────────────────────

test('makeSpecialist: argue throws → safe abstain', async () => {
  const broken = makeSpecialist('broken', ['all'], async () => {
    throw new Error('boom');
  });
  const v = await broken({ trigger: { kind: 'buy_proposal' } });
  assert.equal(v.verdict, 'abstain');
  assert.match(v.abstained_because, /boom/);
  assert.equal(v.specialist, 'broken');
});

test('makeSpecialist: argue returns invalid voice → safe abstain', async () => {
  const broken = makeSpecialist('broken', ['all'], async () => {
    return { verdict: 'invalid-verdict', citations: [] };
  });
  const v = await broken({ trigger: { kind: 'buy_proposal' } });
  assert.equal(v.verdict, 'abstain');
});

test('voteFor: invalid verdict coerces to abstain', () => {
  const v = voteFor('x', 'bork', 0.5, 'rationale');
  assert.equal(v.verdict, 'abstain');
});

test('matchesDomain: all = always match', () => {
  assert.equal(matchesDomain({ trigger: { venue: 'kucoin' } }, ['all']), true);
});

test('matchesDomain: crypto matches kucoin + binance', () => {
  assert.equal(matchesDomain({ trigger: { venue: 'kucoin' } }, ['crypto']), true);
  assert.equal(matchesDomain({ trigger: { venue: 'binance' } }, ['crypto']), true);
  assert.equal(matchesDomain({ trigger: { venue: 'alpaca' } }, ['crypto']), false);
});

test('abstainBecause: clean shape', () => {
  const v = abstainBecause('x', 'reason');
  assert.equal(v.verdict, 'abstain');
  assert.equal(v.abstained_because, 'reason');
  assert.equal(v.confidence, 0);
});
