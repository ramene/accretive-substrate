import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aletheiaWeightsPath,
  regimePresetPath,
  gateDefPath,
  strategyDocPath,
  perSymbolPath,
  parseCanonicalPath,
  ARTIFACT_TYPES,
} from '../src/canonical-paths.mjs';

test('aletheiaWeightsPath returns global', () => {
  assert.equal(aletheiaWeightsPath(), 'aletheia.weights');
});

test('regimePresetPath: scope by regime', () => {
  assert.equal(regimePresetPath('chop-day'), 'regime-preset:chop-day');
});

test('gateDefPath: scope by gate id', () => {
  assert.equal(gateDefPath('source-conflict'), 'gate-def:source-conflict');
});

test('strategyDocPath: scope by doc name', () => {
  assert.equal(
    strategyDocPath('TRADING-RESUME-RUNBOOK'),
    'strategy-doc:TRADING-RESUME-RUNBOOK'
  );
});

test('perSymbolPath: scope by symbol', () => {
  assert.equal(perSymbolPath('BTC-USDT'), 'per-symbol:BTC-USDT');
});

test('builders throw when id missing', () => {
  assert.throws(() => regimePresetPath(''));
  assert.throws(() => gateDefPath(undefined));
  assert.throws(() => strategyDocPath(null));
  assert.throws(() => perSymbolPath(0));
});

test('parseCanonicalPath: split by first colon', () => {
  assert.deepEqual(parseCanonicalPath('regime-preset:chop-day'),
                   { type: 'regime-preset', id: 'chop-day' });
  assert.deepEqual(parseCanonicalPath('aletheia.weights'),
                   { type: 'aletheia.weights', id: null });
  assert.deepEqual(parseCanonicalPath('per-symbol:KAS-USDT'),
                   { type: 'per-symbol', id: 'KAS-USDT' });
});

test('ARTIFACT_TYPES enum frozen', () => {
  assert.throws(() => { ARTIFACT_TYPES.NEW_TYPE = 'x'; });
});
