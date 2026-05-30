import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAccretion,
  withDefaults,
  PROVENANCE_CLASSES,
} from '../src/schema.mjs';

test('validateAccretion: minimum-required passes', () => {
  const r = validateAccretion({
    canonical_path: 'regime-preset:chop-day',
    operator: 'ramene',
    fact: 'minSignalConfidence floor lowered 0.72 → 0.65',
    provenance_class: 'operator_authored_realtime',
  });
  assert.equal(r.ok, true, r.errors.join(';'));
});

test('validateAccretion: missing canonical_path fails', () => {
  const r = validateAccretion({
    operator: 'ramene',
    fact: 'x',
    provenance_class: 'operator_authored_realtime',
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(';'), /canonical_path/);
});

test('validateAccretion: backfill requires backfill_source', () => {
  const r = validateAccretion({
    canonical_path: 'gate-def:source-conflict',
    operator: 'ramene',
    fact: 'x',
    provenance_class: 'journal_distilled_backfill',
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(';'), /backfill_source/);
});

test('validateAccretion: coach_provisional cannot be operator_confirmed=true at insert', () => {
  const r = validateAccretion({
    canonical_path: 'regime-preset:chop-day',
    operator: 'coach',
    fact: 'provisional rule',
    provenance_class: 'coach_provisional',
    operator_confirmed: true,
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(';'), /coach_provisional/);
});

test('validateAccretion: bounded enums', () => {
  const r1 = validateAccretion({
    canonical_path: 'per-symbol:BTC-USDT',
    operator: 'ramene', fact: 'x',
    provenance_class: 'operator_authored_realtime',
    capital_band: 'banana',
  });
  assert.equal(r1.ok, false);
  assert.match(r1.errors.join(';'), /capital_band/);

  const r2 = validateAccretion({
    canonical_path: 'per-symbol:BTC-USDT',
    operator: 'ramene', fact: 'x',
    provenance_class: 'operator_authored_realtime',
    circuit_breaker_action: 'panic',
  });
  assert.equal(r2.ok, false);
  assert.match(r2.errors.join(';'), /circuit_breaker_action/);
});

test('withDefaults: coach_provisional → operator_confirmed=false', () => {
  const r = withDefaults({
    canonical_path: 'x', operator: 'coach', fact: 'y',
    provenance_class: 'coach_provisional',
  });
  assert.equal(r.operator_confirmed, false);
});

test('withDefaults: operator_authored_realtime → operator_confirmed=true', () => {
  const r = withDefaults({
    canonical_path: 'x', operator: 'ramene', fact: 'y',
    provenance_class: 'operator_authored_realtime',
  });
  assert.equal(r.operator_confirmed, true);
});

test('PROVENANCE_CLASSES enum: exactly 3 classes', () => {
  assert.deepEqual(
    [...PROVENANCE_CLASSES].sort(),
    ['coach_provisional', 'journal_distilled_backfill', 'operator_authored_realtime'].sort()
  );
});
