import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDeliberation } from '../src/orchestrator.mjs';
import { makeSpecialist, voteFor, abstainBecause } from '../src/specialists/base.mjs';

const buyEvidence = {
  trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'kucoin', agent_id: 6 },
  signals: [{ source: 'kucoin-scanner', direction: 'bullish', confidence: 0.72 }],
  accretions: [
    { id: 42, canonical_path: 'regime-preset:sideways', operator_confirmed: true,
      fact: 'minSignalConfidence 0.65', operator: 'ramene', appended_at: '2026-05-10T00:00:00Z' },
  ],
  prior_trades: [],
  gate_state: { active: [], blocking: [] },
  regime_state: { regime: 'SIDEWAYS', confidence: 0.82 },
  fng: { index: 28, classification: 'fear' },
  brain_cascade_health: { tier1_ok: true, tier2_ok: true },
  empirical_priors: {},
  aletheia_state: { weights: { sources: { 'kucoin-scanner': 0.6 } } },
  proposed_position: { symbol: 'BTC-USDT', qty: 0.001, estimated_dollar: 10, agent_position_dollar_floor: 10 },
};

test('orchestrator: full loop with default specialists → execute', async () => {
  const persisted = [];
  const r = await runDeliberation(
    { evidence: buyEvidence, source_pipeline: 'node' },
    {
      persist: async (row) => { persisted.push(row); return { id: 1, ts: new Date(), ok: true }; },
    },
  );
  assert.equal(r.final_verdict, 'execute');
  assert.equal(r.persisted, true);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].source_pipeline, 'node');
  // Full registry runs (8 specialists in B2); only those that match domain
  // produce non-abstain voices. Validate by specialist presence, not count,
  // so this test stays stable as registry grows.
  const names = persisted[0].voices.map(v => v.specialist).sort();
  assert.ok(names.includes('regime'));
  assert.ok(names.includes('aletheia'));
  assert.equal(persisted[0].adjudication.verdict, 'buy');
});

test('orchestrator: missing evidence → abort', async () => {
  const r = await runDeliberation({ source_pipeline: 'node' });
  assert.equal(r.final_verdict, 'abort');
  assert.match(r.error, /no evidence/);
});

test('orchestrator: invalid source_pipeline → abort', async () => {
  const r = await runDeliberation({ evidence: buyEvidence, source_pipeline: 'nowhere' });
  assert.equal(r.final_verdict, 'abort');
});

test('orchestrator: persist failure does NOT block verdict', async () => {
  const r = await runDeliberation(
    { evidence: buyEvidence, source_pipeline: 'go' },
    { persist: async () => ({ ok: false, error: 'pg-down' }) },
  );
  assert.equal(r.persisted, false);
  assert.equal(r.persist_error, 'pg-down');
  // Verdict still emitted.
  assert.equal(r.final_verdict, 'execute');
});

test('orchestrator: custom specialists override default registry', async () => {
  const customBuy = makeSpecialist('custom-buy', ['all'], async () => voteFor('custom-buy', 'buy', 0.9, 'forced buy'));
  const customSell = makeSpecialist('custom-sell', ['all'], async () => voteFor('custom-sell', 'sell', 0.85, 'forced sell'));
  let brainCalled = false;
  const r = await runDeliberation(
    { evidence: buyEvidence, source_pipeline: 'node' },
    {
      specialists: [customBuy, customSell],
      brain: async () => {
        brainCalled = true;
        return JSON.stringify({ verdict: 'buy', confidence: 0.6, explanation: 'tiebreak' });
      },
      persist: async () => ({ id: 99, ts: new Date(), ok: true }),
    },
  );
  assert.equal(r.voices.length, 2);
  assert.equal(brainCalled, true, 'high-dissent should escalate to brain');
  assert.equal(r.adjudication.brain_escalated, true);
});

test('orchestrator: hard-blocked → abort', async () => {
  const blockedEvidence = { ...buyEvidence, gate_state: { active: [], blocking: ['capital_halt'] } };
  const r = await runDeliberation(
    { evidence: blockedEvidence, source_pipeline: 'node' },
    { persist: async () => ({ id: 1, ok: true }) },
  );
  assert.equal(r.final_verdict, 'abort');
  assert.equal(r.guardrail.passed, false);
  assert.deepEqual(r.guardrail.hard_blocks, ['capital_halt']);
});

test('orchestrator: soft conflict above $25 → operator_required', async () => {
  const conflictEvidence = {
    ...buyEvidence,
    accretions: [
      { id: 99, operator_confirmed: false, fact: 'NO BUY during FNG fear', canonical_path: 'x' },
    ],
    proposed_position: { estimated_dollar: 100, agent_position_dollar_floor: 20 },
  };
  const r = await runDeliberation(
    { evidence: conflictEvidence, source_pipeline: 'node' },
    { persist: async () => ({ id: 1, ok: true }) },
  );
  assert.equal(r.final_verdict, 'operator_required');
  assert.equal(r.guardrail.policy_applied, 'pause');
});
