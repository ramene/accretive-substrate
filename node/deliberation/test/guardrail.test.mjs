import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceGuardrails } from '../src/guardrail.mjs';

test('guardrail: no hard blocks + no soft conflicts → passes clean', () => {
  const r = enforceGuardrails(
    {
      gate_state: { blocking: [] },
      accretions: [],
      proposed_position: { estimated_dollar: 20, agent_position_dollar_floor: 10 },
    },
    { verdict: 'buy' },
  );
  assert.equal(r.passed, true);
  assert.equal(r.hard_blocks.length, 0);
  assert.equal(r.soft_conflicts.length, 0);
  assert.equal(r.policy_applied, 'no_conflicts');
});

test('guardrail: hard block → passed=false', () => {
  const r = enforceGuardrails(
    { gate_state: { blocking: ['capital_halt'] }, accretions: [], proposed_position: {} },
    { verdict: 'buy' },
  );
  assert.equal(r.passed, false);
  assert.deepEqual(r.hard_blocks, ['capital_halt']);
});

test('guardrail: unconfirmed accretion opposing → soft conflict', () => {
  const r = enforceGuardrails(
    {
      gate_state: { blocking: [] },
      accretions: [
        {
          id: 99,
          operator_confirmed: false,
          canonical_path: 'per-symbol:BTC-USDT',
          fact: 'PAUSE BUYS during high VIX windows',
        },
      ],
      proposed_position: { estimated_dollar: 15, agent_position_dollar_floor: 10 },
    },
    { verdict: 'buy' },
  );
  assert.equal(r.soft_conflicts.length, 1);
  // floor=10, threshold=max(20, 25)=25, proposed=15 → flag
  assert.equal(r.policy_applied, 'flag');
  assert.equal(r.exposure_threshold, 25);
});

test('guardrail: soft conflict + above threshold → pause', () => {
  const r = enforceGuardrails(
    {
      gate_state: { blocking: [] },
      accretions: [
        { id: 99, operator_confirmed: false, fact: 'NO BUY in this window', canonical_path: 'x' },
      ],
      proposed_position: { estimated_dollar: 60, agent_position_dollar_floor: 20 },
    },
    { verdict: 'buy' },
  );
  // floor=20, threshold=max(40, 25)=40, proposed=60 → pause
  assert.equal(r.policy_applied, 'pause');
  assert.equal(r.exposure_threshold, 40);
});

test('guardrail: confirmed accretion does NOT trigger soft conflict', () => {
  const r = enforceGuardrails(
    {
      gate_state: { blocking: [] },
      accretions: [
        { id: 99, operator_confirmed: true, fact: 'pause buys', canonical_path: 'x' },
      ],
      proposed_position: { estimated_dollar: 100, agent_position_dollar_floor: 10 },
    },
    { verdict: 'buy' },
  );
  assert.equal(r.soft_conflicts.length, 0);
  assert.equal(r.policy_applied, 'no_conflicts');
});

test('guardrail: minimum absolute pause floor is $25', () => {
  const r = enforceGuardrails(
    {
      gate_state: { blocking: [] },
      accretions: [{ id: 1, operator_confirmed: false, fact: 'no buy', canonical_path: 'x' }],
      proposed_position: { estimated_dollar: 10, agent_position_dollar_floor: 5 },
    },
    { verdict: 'buy' },
  );
  // floor=5, threshold=max(10, 25)=25, proposed=10 → flag (below 25)
  assert.equal(r.exposure_threshold, 25);
  assert.equal(r.policy_applied, 'flag');
});

test('guardrail: hold verdict has no directional soft conflicts', () => {
  const r = enforceGuardrails(
    {
      gate_state: { blocking: [] },
      accretions: [
        { id: 1, operator_confirmed: false, fact: 'no buy under conditions', canonical_path: 'x' },
      ],
      proposed_position: { estimated_dollar: 100, agent_position_dollar_floor: 10 },
    },
    { verdict: 'hold' },
  );
  assert.equal(r.soft_conflicts.length, 0);
});
