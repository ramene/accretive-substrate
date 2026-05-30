# @accretive-substrate/accretive

Accretive Retrieval for the Mae trading platform.

The pattern: canonical artifacts (regime presets, gate defs, aletheia weights,
strategy docs, per-symbol rules) accumulate operator-authored modifications
over time **without mutating the canonical artifact**. Each modification is
provenance-tagged, timestamped, and append-only. Consumers (coach,
orchestrator, in-flight-buys, <venue-monitor-service> SELL) read latest-N
accretions for a given `canonical_path` before deciding.

Spec: [`docs/ACCRETIVE-RETROFIT-SPEC-2026-05-24.md`](../../docs/ACCRETIVE-RETROFIT-SPEC-2026-05-24.md)

## Storage

PG-backed, single `accretions` table — see `migrations/shadow/0035_accretions.sql`.

`canonical_path` is a **logical identifier**, not a filesystem path:

| canonical_path                                  | Meaning                          |
|-------------------------------------------------|----------------------------------|
| `aletheia.weights`                              | Global aletheia tunables         |
| `regime-preset:chop-day`                        | Per-regime preset overrides      |
| `gate-def:source-conflict`                      | Per-gate behavior accretions     |
| `strategy-doc:TRADING-RESUME-RUNBOOK`           | Runbook accretions               |
| `per-symbol:BTC-USDT`                           | Per-symbol trading rules         |

## API

```js
import {
  appendAccretion,
  getAccretions,
  latestAccretion,
  citationOf,
  regimePresetPath,
  perSymbolPath,
} from '@accretive-substrate/accretive';

// Author a new rule (operator-confirmed at write time).
await appendAccretion({
  canonical_path: regimePresetPath('chop-day'),
  operator: 'ramene',
  fact: 'minSignalConfidence floor lowered 0.72 → 0.65 — APE/ENJ at 70-71% were legitimate mean-reversion setups.',
  regime_context: { regime: 'SIDEWAYS', confidence: 0.98 },
  capital_band: '10_25',
  provenance_class: 'operator_authored_realtime',
});

// Read latest-32 accretions for a canonical_path.
const rules = await getAccretions(regimePresetPath('chop-day'));

// Compact citation for memory_cite audit field.
const cite = citationOf(rules[0]);
// → "accretion#42:ramene@2026-05-29T18:08:00Z"
```

## Graceful degradation

When PG is unreachable (full sleep, network blip, schema mismatch):

- `getAccretions()` returns `[]`. Consumer falls back to canonical-only behavior.
- `appendAccretion()` returns `{ ok: false, error: 'pg-unavailable' }`. Caller
  decides whether to retry or surface to the operator.

This contract is non-negotiable: **the read path can never block a trade
decision.**

## Provenance + promotion

Three provenance classes (precedence high → low):

1. `operator_authored_realtime` — operator types the rule in-session.
2. `journal_distilled_backfill` — historical rule recovered from journal
   digest; `backfill_source` REQUIRED (e.g., `digest:2026-05-10`).
3. `coach_provisional` — coach proposes a rule from divergence analysis;
   `operator_confirmed = false` until promoted.

**Promotion** = INSERT a new `operator_authored_realtime` row with
`promotion_event_id` pointing at the provisional. The provisional row is
NEVER mutated (the only allowed update is stamping `promoted_at` on the
provisional row when the new row is inserted — see `store.mjs`).

## Wired consumers (5 integration points)

| Where                                                  | Reads                              |
|--------------------------------------------------------|------------------------------------|
| `coach.mjs::recommendPreset`                           | `regime-preset:<regime>`           |
| `coach.mjs::investigate`                               | `per-symbol:<symbol>` (under investigation) |
| `trading-orchestrator-v2.mjs::signalCheck`             | `per-symbol:<symbol>` (per signal) |
| `in-flight-buys.mjs::markBuyInFlight` (logged metadata) | `per-symbol:<symbol>`              |
| `<venue-monitor-service>` SELL path               | `per-symbol:<symbol>` → `memory_cite` on trades_audit row |

## Litmus

`docs/examples/accretive-proof.sh` exercises append → read → cite end-to-end
against a live DB. Run after wake to verify the wiring.

## Tests

```sh
cd packages/accretive && pnpm test
```
