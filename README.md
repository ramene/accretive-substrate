# accretive-substrate

> A reference implementation of **Evidence-Bound Retrieval (EBR)** for
> autonomous-decision systems — typed PG-backed accretions, multi-specialist
> deliberation loop, cross-language (Node + Go) parity, and operator-in-the-loop
> promotion of provisional rules to confirmed institutional memory.

## What this is

`accretive-substrate` is the paper-relevant subset of an EBR-pairing
implementation originally built for an autonomous trading platform. It is
extracted into this standalone repository to support the published academic
papers:

- *Evidence-Bound Retrieval for Clinical AI: An Accretive Memory Substrate with
  Patient-Owned Keys* — [memory-oracle](https://github.com/ramene/memory-oracle)
- *Evidence-Bound Retrieval: A Substrate for CoALA's Episodic Memory Layer* —
  [memory-oracle](https://github.com/ramene/memory-oracle)
- *Accretive Retrieval and the Deliberation Loop in Autonomous Systems*
  (forthcoming arXiv preprint) — anchored on this repository

The papers establish the unifying meta-term **EBR record** — an append-only,
operator-authored modification to a canonical artifact, retrieved by a
substrate that binds responses to current operator-authored evidence by
construction. Implementations may use file-system sidecar JSONL records
(clinical lineage, vocabulary: "amendment record") or relational-database rows
(financial lineage, vocabulary: "accretion"). Both satisfy the precedence
invariant.

This repository implements the **accretion variant** in production-grade form
across Node (TypeScript-ish ESM with type-validated runtime) and Go (typed,
PG-pooled, Cloud Run-deployable).

## Repository layout

```
accretive-substrate/
├── migrations/              # PG schema — the substrate's authoritative shape
│   ├── 0035_accretions.sql        # accretions table — 11 fields, CHECK-enforced provenance
│   ├── 0036_accretions_seed.sql   # 10 bootstrap rows for litmus
│   └── 0037_deliberation.sql      # deliberations table + evidence_refs JSONB on accretions
├── node/
│   ├── accretive/           # @accretive-substrate/accretive — Node library
│   └── deliberation/        # @accretive-substrate/deliberation — Node deliberation loop
├── go/
│   ├── accretive/           # github.com/ramene/accretive-substrate/go/accretive
│   └── deliberation/        # github.com/ramene/accretive-substrate/go/deliberation
├── examples/
│   └── accretive-proof.sh   # litmus test for the substrate
└── fixtures/                # bridge fixtures — the operator-authorship story made concrete
    ├── btc-bull-buy.json
    ├── crash-block-buy.json
    ├── crash-blocked-by-accretion.json
    └── operator-pause-conflict.json
```

## The two libraries

### `node/accretive` + `go/accretive` — the substrate

A typed, PG-backed implementation of the accretion pattern:

- **Append, never mutate.** Every operator-authored modification appends a new
  row. The original is preserved unmutated for audit.
- **Provenance is first-class.** Three classes enforced at insert via PG CHECK
  constraints: `operator_authored_realtime`, `journal_distilled_backfill`,
  `coach_provisional`.
- **Promotion is also an append.** A `coach_provisional` row is "promoted" to
  `operator_authored_realtime` by *inserting* a new row that references the
  provisional via `promotion_event_id`; the original is preserved.
- **Citations are portable.** `accretion#<id>:<operator>@<iso8601-no-millis>Z`
  renders byte-identically in Node + Go, suitable for embedding in audit rows,
  brain prompts, and external systems.
- **Graceful degradation.** Read failures return `[]`; write failures log and
  swallow. The substrate never blocks a decision.

### `node/deliberation` + `go/deliberation` — the deliberation loop

A 6-stage debate framework over the accretion substrate:

1. **Assemble** evidence (signals, accretions, prior trades, regime, gate state)
2. **Argue** — N parallel domain-specialist functions emit
   `{verdict, confidence, rationale, citations[]}`
3. **Adjudicate** — hybrid weighted-majority + brain-on-dissent (escalates only
   when dissent score crosses threshold)
4. **Guardrail** — hard blocks from registry + context-aware soft conflicts
5. **Persist** — `deliberations` row with full audit trail + memory_cite flows
   to downstream audit
6. **Observer authorship** — pattern detectors propose `coach_provisional`
   accretions from runtime evidence; operator promotes via one action

Eight domain specialists ship: regime, aletheia (learned-weight signal scoring),
empirical-prior, crypto-majors, equities, memes, defi, polymarket. Six
observers ship: per-symbol-drift, specialist-dissent, hard-block-cascade,
soft-conflict-cluster, verdict-flip-flop, high-dissent-persistence.

## Bridge fixtures — the operator-authorship story made concrete

The four JSON files in `fixtures/` are the empirical version of the bridge
claim:

| Fixture | What it demonstrates |
|---|---|
| `btc-bull-buy.json` | Happy-path execute — all specialists agree, guardrail passes, final verdict `execute`. |
| `crash-block-buy.json` | A buy proposal during a CRASH regime with no operator-authored "block buys in CRASH" accretion — the substrate STILL leans buy because the highest-confidence specialist outweighs the regime specialist. This is the bridge *gap*. |
| `crash-blocked-by-accretion.json` | The same scenario with the operator-authored accretion in scope — the guardrail's soft-conflict policy pauses for operator. Bridge *closed* by operator authorship. |
| `operator-pause-conflict.json` | Above-threshold $-exposure triggers the context-aware pause policy. |

Together they prove a paper-grade claim: **the substrate surfaces dissent
visibly enough that the operator can author institutional memory that future
debates cite by construction.** That's the noise → evidence bridge.

## Cross-language parity

Both implementations of every component (schema, citation format, specialist
verdicts, adjudicator weighting, guardrail policy) produce byte-identical
results given identical evidence. The same fixture files in `fixtures/` are
loaded by both Node and Go test suites; divergence on either side fails the
parity tests on both sides.

## Relationship to the source platform

This repository is a **focused extract** of a larger, intentionally private
trading platform. What's here is the substrate code that backs the academic
papers. What's *not* here:

- Trading strategy logic, signal-generation, regime detection, agent runtime
- Venue clients (Binance, KuCoin, Alpaca, etc.)
- Risk engine, position tracking, capital allocation
- Cloud Build / deployment infrastructure beyond a minimal Dockerfile example
- Operator-specific dashboards, runbooks, secrets, configuration

The substrate is designed to be useful *outside* a trading context — it's an
EBR pairing for any system that has canonical artifacts modified over time by
operator-authored decisions, where those modifications need typed provenance,
audit trails, and verifiable citation.

## License

MIT (see `LICENSE`).

## Citation

If you cite this substrate in academic work:

```bibtex
@misc{anthony2026accretive,
  author       = {Anthony, Ramene},
  title        = {accretive-substrate: A Reference Implementation of
                   Evidence-Bound Retrieval},
  year         = {2026},
  howpublished = {\url{https://github.com/ramene/accretive-substrate}},
  note         = {Companion to the memory-oracle papers; \texttt{verum2026}
                   for cryptographic enforcement; \texttt{anthony2026ebr} for
                   the EBR position paper.}
}
```

## Related work

- [memory-oracle](https://github.com/ramene/memory-oracle) — the EBR paper
  substrate (MIT-licensed, file-sidecar implementation, clinical case study)
- [verum](https://github.com/ramene/verum) — the cryptographic substrate for
  EBR (GPL-3.0; signed amendments, hash-chained audit, on-chain anchoring,
  Shamir M-of-N key recovery)
- [TurboQuant](https://github.com/ramene/turboquant-plutus) — reference
  deployment for FP8 KV-cache inference, paired with EBR for cost parity on
  longer amendment-merged contexts
