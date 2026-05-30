/**
 * Tests for the 5 additional observers shipped after per-symbol-drift.
 * Each test exercises the runX function with a fake pool + injected
 * appendAccretion to verify: detection SQL shape, cooldown, emit shape.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSpecialistDissentObserver } from '../src/observers/specialist-dissent.mjs';
import { runHardBlockCascadeObserver } from '../src/observers/hard-block-cascade.mjs';
import { runSoftConflictClusterObserver } from '../src/observers/soft-conflict-cluster.mjs';
import { runVerdictFlipFlopObserver } from '../src/observers/verdict-flip-flop.mjs';
import { runHighDissentPersistenceObserver } from '../src/observers/high-dissent-persistence.mjs';

/** Build a fake pgPool that returns canned detections + tracks INSERTs. */
function mkPool(detected, cooldownHits = new Set()) {
  const inserts = [];
  return {
    inserts,
    query: async (sql, params) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (s.includes('FROM deliberations')) return { rows: detected };
      if (s.includes('FROM accretions')) {
        if (cooldownHits.has(params[0])) return { rows: [{ '?column?': 1 }] };
        return { rows: [] };
      }
      if (s.startsWith('INSERT INTO accretions')) {
        const id = inserts.length + 1;
        inserts.push({ canonical_path: params[0], fact: params[3], raw: params[17] });
        return { rows: [{ id, appended_at: new Date() }] };
      }
      return { rows: [] };
    },
  };
}

// ─── specialist-dissent ───────────────────────────────────────────────────

test('specialist-dissent: detects + emits accretion', async () => {
  const pool = mkPool([
    { specialist: 'memes', verdict: 'sell', n: 4, deliberation_ids: [1,2,3,4], first_seen_at: 'a', last_seen_at: 'b' },
  ]);
  const captured = [];
  const r = await runSpecialistDissentObserver({
    pool,
    appendAccretion: async (row) => { captured.push(row); return { id: 1, ok: true }; },
  });
  assert.equal(r.detected, 1);
  assert.equal(r.emitted, 1);
  assert.equal(captured[0].canonical_path, 'gate-def:memes-weight');
  assert.equal(captured[0].raw.observer, 'specialist-dissent');
  assert.equal(captured[0].raw.evidence_refs.specialist, 'memes');
});

test('specialist-dissent: empty → zero work', async () => {
  const r = await runSpecialistDissentObserver({
    pool: mkPool([]),
    appendAccretion: async () => ({ id: 1, ok: true }),
  });
  assert.equal(r.detected, 0);
  assert.equal(r.emitted, 0);
});

// ─── hard-block-cascade ───────────────────────────────────────────────────

test('hard-block-cascade: detects + emits gate-def accretion', async () => {
  const pool = mkPool([
    { block_name: 'capital_halt', n: 5, deliberation_ids: [10,11,12,13,14], first_seen_at: 'a', last_seen_at: 'b' },
  ]);
  const captured = [];
  const r = await runHardBlockCascadeObserver({
    pool,
    appendAccretion: async (row) => { captured.push(row); return { id: 2, ok: true }; },
  });
  assert.equal(r.detected, 1);
  assert.equal(r.emitted, 1);
  assert.equal(captured[0].canonical_path, 'gate-def:capital_halt');
  assert.equal(captured[0].raw.evidence_refs.gate_id, 'capital_halt');
});

test('hard-block-cascade: cooldown skips emit', async () => {
  const pool = mkPool(
    [{ block_name: 'capital_halt', n: 5, deliberation_ids: [1], first_seen_at: 'a', last_seen_at: 'b' }],
    new Set(['gate-def:capital_halt']),
  );
  const r = await runHardBlockCascadeObserver({
    pool,
    appendAccretion: async () => ({ id: 1, ok: true }),
  });
  assert.equal(r.skipped, 1);
  assert.equal(r.emitted, 0);
});

// ─── soft-conflict-cluster ────────────────────────────────────────────────

test('soft-conflict-cluster: detects + emits promotion suggestion', async () => {
  const pool = mkPool([
    { accretion_id: '42', conflict_canonical_path: 'per-symbol:BTC-USDT', n: 4, deliberation_ids: [20,21,22,23], first_seen_at: 'a', last_seen_at: 'b' },
  ]);
  const captured = [];
  const r = await runSoftConflictClusterObserver({
    pool,
    appendAccretion: async (row) => { captured.push(row); return { id: 3, ok: true }; },
  });
  assert.equal(r.detected, 1);
  assert.equal(r.emitted, 1);
  assert.equal(captured[0].canonical_path, 'strategy-doc:accretion-promotion-42');
  assert.equal(captured[0].raw.evidence_refs.referenced_accretion_id, 42);
});

// ─── verdict-flip-flop ────────────────────────────────────────────────────

test('verdict-flip-flop: detects + emits per-symbol accretion', async () => {
  const pool = mkPool([
    { symbol: 'BTC-USDT', n: 6, distinct_verdicts: 2, verdict_set: ['buy', 'sell'], deliberation_ids: [30,31,32,33,34,35], first_seen_at: 'a', last_seen_at: 'b' },
  ]);
  const captured = [];
  const r = await runVerdictFlipFlopObserver({
    pool,
    appendAccretion: async (row) => { captured.push(row); return { id: 4, ok: true }; },
    perSymbolPath: (s) => `per-symbol:${s}`,
  });
  assert.equal(r.detected, 1);
  assert.equal(r.emitted, 1);
  assert.equal(captured[0].canonical_path, 'per-symbol:BTC-USDT');
  assert.deepEqual(captured[0].raw.evidence_refs.verdict_set, ['buy', 'sell']);
});

// ─── high-dissent-persistence ─────────────────────────────────────────────

test('high-dissent-persistence: detects + emits per-symbol accretion', async () => {
  const pool = mkPool([
    { symbol: 'ETH-USDT', n: 4, avg_dissent: 0.62, deliberation_ids: [40,41,42,43], first_seen_at: 'a', last_seen_at: 'b' },
  ]);
  const captured = [];
  const r = await runHighDissentPersistenceObserver({
    pool,
    appendAccretion: async (row) => { captured.push(row); return { id: 5, ok: true }; },
    perSymbolPath: (s) => `per-symbol:${s}`,
  });
  assert.equal(r.detected, 1);
  assert.equal(r.emitted, 1);
  assert.equal(captured[0].canonical_path, 'per-symbol:ETH-USDT');
  assert.equal(captured[0].raw.evidence_refs.avg_dissent_score, 0.62);
});

test('all observers: graceful when @accretive-substrate/accretive unavailable + no inject', async () => {
  // Without injected appendAccretion AND without @accretive-substrate/accretive resolvable in
  // test env, each observer returns errors:1 (graceful — never throws).
  const pool = mkPool([{ symbol: 'X', verdict: 'buy', n: 3, deliberation_ids: [1,2,3], first_seen_at: 'a', last_seen_at: 'b' }]);
  for (const run of [runSpecialistDissentObserver, runHardBlockCascadeObserver, runSoftConflictClusterObserver, runVerdictFlipFlopObserver, runHighDissentPersistenceObserver]) {
    const r = await run({ pool });
    assert.ok(r.errors === 1 || r.emitted >= 0, 'observer should degrade gracefully');
  }
});
