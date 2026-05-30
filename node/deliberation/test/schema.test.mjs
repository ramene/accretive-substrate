import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEvidencePackage,
  validateVoice,
  validateAdjudication,
  validateGuardrailResult,
  finalVerdictFor,
  isOperatorRequiredVerdict,
  TRIGGER_KINDS,
  VERDICTS,
  FINAL_VERDICTS,
  SOURCE_PIPELINES,
} from '../src/schema.mjs';

test('validateEvidencePackage: minimum trigger required', () => {
  const r = validateEvidencePackage({ trigger: { kind: 'buy_proposal' } });
  assert.equal(r.ok, true);
});

test('validateEvidencePackage: invalid trigger.kind fails', () => {
  const r = validateEvidencePackage({ trigger: { kind: 'wat' } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(';'), /trigger\.kind/);
});

test('validateEvidencePackage: signals must be array if present', () => {
  const r = validateEvidencePackage({
    trigger: { kind: 'buy_proposal' },
    signals: 'not-array',
  });
  assert.equal(r.ok, false);
});

test('validateVoice: minimum valid', () => {
  const r = validateVoice({
    specialist: 'regime',
    verdict: 'buy',
    confidence: 0.7,
    rationale: 'regime=BULL',
    citations: [],
  });
  assert.equal(r.ok, true);
});

test('validateVoice: abstain requires abstained_because', () => {
  const r = validateVoice({
    specialist: 'regime',
    verdict: 'abstain',
    confidence: 0,
    rationale: 'abstain',
    citations: [],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(';'), /abstained_because/);
});

test('validateVoice: confidence must be 0..1', () => {
  const r = validateVoice({
    specialist: 'regime',
    verdict: 'buy',
    confidence: 1.5,
    rationale: 'x',
    citations: [],
  });
  assert.equal(r.ok, false);
});

test('validateAdjudication: no abstain at adjudication level', () => {
  const r = validateAdjudication({
    verdict: 'abstain',
    confidence: 0.5,
    dissent_score: 0,
    brain_escalated: false,
  });
  assert.equal(r.ok, false);
});

test('finalVerdictFor: pass + buy → execute', () => {
  assert.equal(
    finalVerdictFor(
      { passed: true, policy_applied: 'no_conflicts' },
      { verdict: 'buy' },
    ),
    'execute',
  );
});

test('finalVerdictFor: hard block → abort', () => {
  assert.equal(
    finalVerdictFor(
      { passed: false, hard_blocks: ['capital_halt'] },
      { verdict: 'buy' },
    ),
    'abort',
  );
});

test('finalVerdictFor: soft conflict pause → operator_required', () => {
  assert.equal(
    finalVerdictFor(
      { passed: true, policy_applied: 'pause' },
      { verdict: 'buy' },
    ),
    'operator_required',
  );
});

test('finalVerdictFor: hold verdict → hold', () => {
  assert.equal(
    finalVerdictFor(
      { passed: true, policy_applied: 'no_conflicts' },
      { verdict: 'hold' },
    ),
    'hold',
  );
});

test('finalVerdictFor: flag policy still executes', () => {
  assert.equal(
    finalVerdictFor(
      { passed: true, policy_applied: 'flag' },
      { verdict: 'buy' },
    ),
    'execute',
  );
});

test('enums are stable', () => {
  assert.deepEqual([...TRIGGER_KINDS].sort().slice(0, 3),
                   ['buy_proposal', 'divergence_investigation', 'gate_stack']);
  assert.deepEqual([...VERDICTS].sort(), ['abstain', 'buy', 'hold', 'sell']);
  assert.deepEqual([...FINAL_VERDICTS].sort(),
                   ['abort', 'execute', 'hold', 'operator_required']);
  assert.deepEqual([...SOURCE_PIPELINES].sort(), ['go', 'node']);
});
