# @accretive-substrate/deliberation

Phase B accretive deliberation loop — multi-specialist debate over trade decisions,
with accretive memory citation and operator-promotable provisional rules.

**Spec:** [`docs/PHASE-B-ACCRETIVE-DELIBERATION-SCOPE.md`](../../docs/PHASE-B-ACCRETIVE-DELIBERATION-SCOPE.md)
**Phase A foundation:** [`packages/accretive/`](../accretive/) — the receiver substrate this loop transmits into.

## What this is

When the orchestrator faces a non-trivial trade decision (high-conf BUY,
stack add, divergence investigation), it calls `runDeliberation()` instead
of (or before) the existing single-narrator brain chain. Eight specialists
argue in parallel; their voices are evidence-grounded (every claim cites a
real evidence row — signal, accretion, past trade, gate trace). An
adjudicator synthesizes with dissent logging. A guardrail enforces the
discipline floor. The whole row lands in the `deliberations` table for
operator review, replay, and observer-pattern-extraction.

The observable, citable, falsifiable form of multi-agent reasoning under
operator governance.

## B1.Node ships (this commit)

- Migration 0037 — `deliberations` table + `accretions.evidence_refs` column
- Library skeleton with `runDeliberation()` async API
- 2 ground-truth specialists: `regime` + `aletheia`
- Hybrid adjudicator: weighted-majority + brain-on-dissent (operator-mandated §10.3)
- Guardrail bridge with operator-mandated context-aware soft-conflict policy (§10.5)
- PG store with graceful-degradation contract
- 52 unit tests covering schema, specialists, adjudication, guardrail, orchestrator

## B2-B6 build out

- B2: 6 remaining specialists + parity matrix with Go side
- B3: observer cron emitting coach_provisional accretions
- B4: coach.mjs + orchestrator-v2 wire-up
- B5: dashboard panel
- B6: live tuning during W6 SHADOW dual-pipeline observation

## Quick usage

```js
import { runDeliberation } from '@accretive-substrate/deliberation';

const result = await runDeliberation(
  {
    evidence: {
      trigger: { kind: 'buy_proposal', symbol: 'BTC-USDT', venue: 'kucoin', agent_id: 6 },
      signals: [{ source: 'kucoin-scanner', direction: 'bullish', confidence: 0.72 }],
      accretions: [...],       // getAccretions() result
      regime_state: getRegimeStateSync(),
      gate_state: { active: [...], blocking: [] },
      aletheia_state: { weights: {...} },
      proposed_position: { estimated_dollar: 25, agent_position_dollar_floor: 10 },
    },
    source_pipeline: 'node',  // 'go' on the Go side
  },
  {
    brain: brainCascadeFn,   // injected — escalation path on dissent
  },
);

// result = { deliberation_id, final_verdict, adjudication, guardrail, voices, persisted }
// final_verdict ∈ { execute | abort | operator_required | hold }
```

## Operator decision pins (§10 of spec, 2026-05-29)

1. **Specialist taxonomy:** 8 domain specialists (this package implements 2 in B1; 6 follow in B2)
2. **Trigger surface:** orchestrator fires deliberation only for conf>0.85 + stack adds + operator-requested (B4 wire-up enforces; this lib doesn't gate)
3. **Adjudication:** hybrid — weighted majority by default, brain synthesis only when `dissent_score ≥ 0.30`
4. **Observer aggressiveness:** ≥3 occurrences in 30min per canonical_path (B3 enforces)
5. **Soft-conflict handling:** context-aware — `pause` when proposed $ > `max(agent_floor × 2, $25)`, else `flag and proceed`

## Architectural contracts (don't break)

- **Read path can NEVER block a trade decision.** Graceful degradation across the board: PG miss → empty subsets, specialists abstain, adjudication still runs, persist failure does not affect the returned verdict.
- **No specialist may throw.** `makeSpecialist()` wraps every argue fn in a safety net that converts thrown errors into `abstain` voices.
- **Brain dependency is injected.** The adjudicator never imports `<host-brain-orchestrator>` directly. This keeps the library decoupled and testable; the caller wires `options.brain`.
- **Same schema on both DBs.** Migration 0037 is dual-applied (SHADOW + LIVE) per `[[feedback_two_pg_databases]]`. The `source_pipeline` column discriminates which writer produced the row.
- **Cross-language consistency.** Go implementation at `<this repo>/go/deliberation/` (B2.Go) MUST produce voices with identical shape. Parity reporter checks volumes + distribution divergence in B6.

## Tests

```sh
node --test packages/deliberation/test/
```

## Lifecycle note

This package is **W6-soak-window-only** after W6 cutover — when the Go
implementation at `<this repo>/go/deliberation/` becomes the sole canonical
deliberation pipeline. The Node implementation here is a temporary
artifact serving the dual-pipeline observation window. Schema, citation
format, and `runDeliberation()` API are stable; the writer count drops
from 2 to 1 at cutover.
