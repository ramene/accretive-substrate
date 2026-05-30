import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjudicate, DEFAULT_DISSENT_THRESHOLD } from '../src/adjudicator.mjs';

const v = (specialist, verdict, confidence) => ({
  specialist, verdict, confidence, rationale: '', citations: [],
  abstained_because: verdict === 'abstain' ? 'x' : null,
});

test('adjudicate: all abstain → hold/0', async () => {
  const r = await adjudicate([
    v('regime', 'abstain', 0),
    v('aletheia', 'abstain', 0),
  ]);
  assert.equal(r.verdict, 'hold');
  assert.equal(r.confidence, 0);
  assert.equal(r.brain_escalated, false);
});

test('adjudicate: unanimous buy → buy with full conf share', async () => {
  const r = await adjudicate([
    v('regime', 'buy', 0.8),
    v('aletheia', 'buy', 0.7),
  ]);
  assert.equal(r.verdict, 'buy');
  assert.equal(r.confidence, 1);
  assert.equal(r.dissent_score, 0);
});

test('adjudicate: split buy/sell triggers dissent escalation', async () => {
  let brainCalled = false;
  const r = await adjudicate(
    [
      v('regime', 'buy', 0.7),
      v('aletheia', 'sell', 0.6),
    ],
    {
      brain: async (prompt) => {
        brainCalled = true;
        assert.match(prompt, /DISSENT/);
        return JSON.stringify({ verdict: 'hold', confidence: 0.5, explanation: 'split' });
      },
    },
  );
  assert.equal(brainCalled, true);
  assert.equal(r.brain_escalated, true);
  assert.ok(r.dissent_score >= DEFAULT_DISSENT_THRESHOLD);
});

test('adjudicate: minor dissent below threshold → no brain', async () => {
  const r = await adjudicate(
    [
      v('a', 'buy', 0.9),
      v('b', 'buy', 0.8),
      v('c', 'sell', 0.1),
    ],
    { brain: async () => 'should-not-be-called' },
  );
  assert.equal(r.brain_escalated, false);
  assert.equal(r.verdict, 'buy');
});

test('adjudicate: brain failure during escalation does not throw', async () => {
  const r = await adjudicate(
    [
      v('a', 'buy', 0.7),
      v('b', 'sell', 0.7),
    ],
    {
      brain: async () => { throw new Error('cascade down'); },
    },
  );
  assert.equal(r.brain_escalated, true);
  assert.equal(r.brain_synthesis, null);
  assert.equal(r.verdict, 'buy');  // weighted-majority still wins
});

test('adjudicate: dissent log identifies opposers', async () => {
  const r = await adjudicate([
    v('regime', 'buy', 0.7),
    v('aletheia', 'sell', 0.6),
    v('empirical', 'hold', 0.5),
  ]);
  assert.ok(r.dissent_log.some(d => d.includes('aletheia')));
  assert.ok(!r.dissent_log.some(d => d.includes('regime')));
});

test('adjudicate: hold-only voices → hold leader', async () => {
  const r = await adjudicate([
    v('a', 'hold', 0.6),
    v('b', 'hold', 0.7),
  ]);
  assert.equal(r.verdict, 'hold');
});

test('adjudicate: custom dissent threshold respected', async () => {
  const r = await adjudicate(
    [
      v('a', 'buy', 0.6),
      v('b', 'sell', 0.4),
    ],
    { dissentThreshold: 0.10, brain: async () => null },
  );
  assert.equal(r.brain_escalated, true);
});
