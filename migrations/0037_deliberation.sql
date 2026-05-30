-- 0037_deliberation.sql  (Phase B1 — Accretive Deliberation Loop, Path B)
--
-- Adds:
--   1. accretions.evidence_refs JSONB column — connects coach_provisional
--      accretions back to the specific trade_ids / deliberation_ids / gate_trace_ids
--      that triggered authorship (the "evidence-based" part operator emphasized).
--   2. deliberations table — one row per multi-specialist debate. Stores the
--      evidence package, voice arguments, adjudication result, guardrail
--      check, and final verdict. trade_ref points at the trade row this
--      debate informed (nullable for HOLD/ABORT verdicts).
--   3. Indexes for: time-ordered live tail, per-symbol filtering, unack
--      operator-required rows surfacing.
--
-- Apply order: this migration depends on 0035_accretions. Safe to apply
-- after 0035+0036 (already live on both DBs as of 2026-05-29 20:02Z).
--
-- Dual-DB rule per [[feedback_two_pg_databases]]: apply to BOTH
-- <shadow-db> (SHADOW) AND <live-db> (LIVE).

BEGIN;

-- ─── Extend accretions with evidence_refs ──────────────────────────────────
ALTER TABLE accretions ADD COLUMN IF NOT EXISTS evidence_refs JSONB;

-- Shape (documented, not enforced — JSONB stays flexible):
--   {
--     "trade_ids": [12345, 12346],
--     "deliberation_ids": [4711, 4712, 4713],
--     "gate_trace_ids": ["abc...", "def..."],
--     "n_occurrences": 3,
--     "window": "30min",
--     "first_seen_at": "2026-05-30T14:23:00Z",
--     "last_seen_at": "2026-05-30T14:51:14Z",
--     "regime_state_at_first": {"regime": "SIDEWAYS", "confidence": 0.82}
--   }

CREATE INDEX IF NOT EXISTS idx_accretions_evidence_trades
  ON accretions USING gin ((evidence_refs->'trade_ids'));
CREATE INDEX IF NOT EXISTS idx_accretions_evidence_deliberations
  ON accretions USING gin ((evidence_refs->'deliberation_ids'));

COMMENT ON COLUMN accretions.evidence_refs IS
  'Evidence FK array for coach_provisional accretions: trade_ids, deliberation_ids, gate_trace_ids, n_occurrences, window, regime context at authorship. The "evidence-based" half of accretive retrieval.';

-- ─── deliberations table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliberations (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_pipeline TEXT NOT NULL,             -- 'node'|'go' — Path B dual-mode discriminator
  trigger_kind TEXT NOT NULL,                -- 'buy_proposal'|'sell_reeval'|'stack_add'|'divergence_investigation'|'regime_transition'|'gate_stack'|'operator_request'
  symbol TEXT,
  venue TEXT,
  agent_id INT,

  -- Evidence package (Stage 1 output)
  evidence_package JSONB NOT NULL,           -- signals + accretions + regime + FNG + gate_state + prior_trades + cascade_health + priors + proposed_position

  -- Voices (Stage 2 output) — array of {specialist, verdict, confidence, rationale, citations, abstained_because}
  voices JSONB NOT NULL,

  -- Adjudication (Stage 3 output) — {verdict, confidence, dissent_score, weight_distribution, brain_escalated, brain_synthesis}
  adjudication JSONB NOT NULL,

  -- Guardrail (Stage 4 output) — {passed, hard_blocks, soft_conflicts, exposure_threshold, policy_applied}
  guardrail_result JSONB NOT NULL,

  -- Final verdict (Stage 5)
  final_verdict TEXT NOT NULL CHECK (
    final_verdict IN ('execute', 'abort', 'operator_required', 'hold')
  ),

  -- Linkage back into the trade audit trail (nullable: HOLD/ABORT/operator_required have no trade row)
  trade_ref BIGINT,                          -- FK to shadow_trades on SHADOW DB; FK to trades_audit on LIVE — soft FK to keep migration portable
  trade_ref_table TEXT,                      -- 'shadow_trades'|'trades_audit' for read-side disambiguation

  -- Operator promotion surface (Stage 6)
  operator_acknowledged_at TIMESTAMPTZ,
  operator_action TEXT,                      -- null | 'promoted_provisional' | 'dismissed_provisional' | 'forced_execute' | 'forced_abort' | 'reviewed_only'

  -- Cross-pipeline correlation (Path B parity reporter uses this)
  peer_deliberation_id BIGINT,               -- the corresponding deliberation on the other DB if found

  -- Schema/library version stamps for forensics
  library_version TEXT,                      -- '@accretive-substrate/deliberation@1.0.0' etc
  schema_version TEXT NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_deliberations_ts
  ON deliberations(ts DESC);

CREATE INDEX IF NOT EXISTS idx_deliberations_symbol_ts
  ON deliberations(symbol, ts DESC) WHERE symbol IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deliberations_pipeline_ts
  ON deliberations(source_pipeline, ts DESC);

CREATE INDEX IF NOT EXISTS idx_deliberations_unack
  ON deliberations(ts DESC)
  WHERE operator_acknowledged_at IS NULL AND final_verdict = 'operator_required';

CREATE INDEX IF NOT EXISTS idx_deliberations_final_verdict
  ON deliberations(final_verdict, ts DESC);

COMMENT ON TABLE deliberations IS
  'One row per multi-specialist debate. Path B dual-mode: Node writes source_pipeline=node to LIVE DB; Go writes source_pipeline=cloud-run to SHADOW DB. Parity reporter compares volumes/distributions across DBs. After W6 cutover, only source_pipeline=cloud-run rows are written.';

COMMENT ON COLUMN deliberations.source_pipeline IS
  'Which decision pipeline produced this row. Determines which DB it lives on during W6 dual-mode. Post-cutover: only cloud-run.';

COMMENT ON COLUMN deliberations.peer_deliberation_id IS
  'When a deliberation on this pipeline can be matched to a deliberation on the other pipeline (same symbol, near-simultaneous ts, similar trigger), this stores the peer id from the OTHER DB. Set by parity reporter post-hoc.';

INSERT INTO schema_migrations (version, description) VALUES
  ('0037_deliberation',
   'Phase B1 — Add deliberations table + accretions.evidence_refs column. Path B dual-mode support via source_pipeline discriminator.')
ON CONFLICT (version) DO NOTHING;

COMMIT;
