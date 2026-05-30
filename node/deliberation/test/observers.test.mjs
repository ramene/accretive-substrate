/**
 * B3.Node observer tests. Uses an in-memory fake pool to avoid PG dependency.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPerSymbolDriftObserver, detectPerSymbolDrift } from '../src/observers/per-symbol-drift.mjs';

/** Build a fake pgPool that returns canned rows for SELECT and records INSERTs. */
function mkFakePool(detected, cooldownHits = new Set()) {
  const inserts = [];
  return {
    inserts,
    cooldownHits,
    query: async (sql, params) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      // Detection query
      if (s.includes('FROM deliberations')) {
        return { rows: detected };
      }
      // Cooldown check
      if (s.includes('FROM accretions') && s.includes('coach_provisional')) {
        const path = params[0];
        if (cooldownHits.has(path)) return { rows: [{ '?column?': 1 }] };
        return { rows: [] };
      }
      // Insert into accretions
      if (s.startsWith('INSERT INTO accretions')) {
        const id = inserts.length + 1;
        inserts.push({ canonical_path: params[0], fact: params[3], raw: params[17] });
        return { rows: [{ id, appended_at: new Date() }] };
      }
      return { rows: [] };
    },
  };
}

test('detectPerSymbolDrift: returns rows from PG', async () => {
  const fakePool = mkFakePool([
    { symbol: 'BTC-USDT', verdict: 'buy', n: 4, first_seen_at: '2026-06-01T00:00:00Z', last_seen_at: '2026-06-01T00:25:00Z', deliberation_ids: [101, 102, 103, 104] },
  ]);
  const r = await detectPerSymbolDrift({ pool: fakePool });
  assert.equal(r.length, 1);
  assert.equal(r[0].symbol, 'BTC-USDT');
  assert.equal(r[0].n, 4);
});

test('runPerSymbolDriftObserver: detects + emits accretion', async () => {
  const fakePool = mkFakePool([
    { symbol: 'BTC-USDT', verdict: 'buy', n: 4, first_seen_at: '2026-06-01T00:00:00Z', last_seen_at: '2026-06-01T00:25:00Z', deliberation_ids: [101, 102, 103, 104] },
  ]);
  const captured = [];
  const fakeAppend = async (row) => { captured.push(row); return { id: 42, ok: true }; };
  const fakePath = (sym) => `per-symbol:${sym}`;

  const r = await runPerSymbolDriftObserver({
    pool: fakePool,
    appendAccretion: fakeAppend,
    perSymbolPath: fakePath,
  });
  assert.equal(r.detected, 1);
  assert.equal(r.emitted, 1);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].canonical_path, 'per-symbol:BTC-USDT');
  assert.equal(captured[0].provenance_class, 'coach_provisional');
  assert.equal(captured[0].operator, 'coach');
  assert.equal(captured[0].raw.observer, 'per-symbol-drift');
  assert.deepEqual(captured[0].raw.evidence_refs.deliberation_ids, [101, 102, 103, 104]);
  assert.equal(captured[0].raw.evidence_refs.n_occurrences, 4);
});

test('runPerSymbolDriftObserver: respects cooldown', async () => {
  const cooldownHits = new Set(['per-symbol:BTC-USDT']);
  const fakePool = mkFakePool([
    { symbol: 'BTC-USDT', verdict: 'buy', n: 5, first_seen_at: '2026-06-01T00:00:00Z', last_seen_at: '2026-06-01T00:25:00Z', deliberation_ids: [201, 202, 203, 204, 205] },
  ], cooldownHits);
  const r = await runPerSymbolDriftObserver({
    pool: fakePool,
    appendAccretion: async () => ({ id: 1, ok: true }),
    perSymbolPath: (s) => `per-symbol:${s}`,
  });
  assert.equal(r.detected, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.emitted, 0);
});

test('runPerSymbolDriftObserver: zero drifts → zero work', async () => {
  const fakePool = mkFakePool([]);
  const r = await runPerSymbolDriftObserver({
    pool: fakePool,
    appendAccretion: async () => ({ id: 1, ok: true }),
    perSymbolPath: (s) => `per-symbol:${s}`,
  });
  assert.equal(r.detected, 0);
  assert.equal(r.emitted, 0);
  assert.equal(r.skipped, 0);
});

test('detectPerSymbolDrift: graceful on PG miss', async () => {
  const failingPool = {
    query: async () => { throw new Error('connection refused'); },
  };
  const r = await detectPerSymbolDrift({ pool: failingPool });
  assert.deepEqual(r, []);
});
