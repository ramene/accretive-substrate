-- 0035_accretions.sql  (Accretive Retrieval — operator-mandated 2026-05-29)
--
-- The "accretion" pattern: canonical artifacts (regime presets, gate defs,
-- aletheia weights, strategy docs, per-symbol rules) accumulate operator-
-- authored modifications over time WITHOUT mutating the canonical artifact.
-- Each append is provenance-tagged and timestamped. Consumers (coach,
-- orchestrator, in-flight-buys, <venue-monitor-service> SELL) read latest-N
-- accretions for a given canonical_path before deciding.
--
-- WHY a single table instead of per-artifact sidecar JSONL files:
--   - PG sweep #287-#295 moved every JSONL/JSON state file to PG to kill
--     multi-writer races. Accretions are state. Mirror the direction.
--   - One indexed table > N sidecar files for retrieval.
--   - Promotion (coach_provisional → operator_authored_realtime) is an
--     INSERT pointing back at the original row via promotion_event_id.
--     Append-never-mutate enforced by app layer (no UPDATEs/DELETEs).
--
-- canonical_path is a LOGICAL identifier, not a filesystem path:
--   'aletheia.weights'              — global aletheia tunables
--   'regime-preset:chop-day'         — per-regime preset overrides
--   'regime-preset:bleed-armor'      —
--   'gate-def:source-conflict'       — per-gate behavior accretions
--   'gate-def:session-multiplier'    —
--   'strategy-doc:TRADING-RESUME-RUNBOOK' — runbook accretions
--   'strategy-doc:scripts/sleep-mae-full.sh' — script behavior accretions
--   'per-symbol:BTC-USDT'            — per-symbol trading rules
--   'per-symbol:_default'            — applies to all symbols
--
-- scope_key is an OPTIONAL secondary discriminator (e.g., agent_id for
-- per-agent preset overrides on the same regime).

BEGIN;

CREATE TABLE IF NOT EXISTS accretions (
  id BIGSERIAL PRIMARY KEY,

  -- ─── Identity ────────────────────────────────────────────────────────────
  canonical_path TEXT NOT NULL,
  scope_key TEXT,
  appended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operator TEXT NOT NULL,

  -- ─── The 11-field schema (per spec Q1 resolution) ────────────────────────
  fact TEXT NOT NULL,
  regime_context JSONB,
  venue_scope JSONB,                                  -- ["kucoin","binance"] | ["all"]
  capital_band TEXT,                                  -- "10" | "10_25" | "25_50" | "50_100" | "100+"
  trigger_event TEXT,
  rollout_stage TEXT,                                 -- shorts/perps only, e.g. "shadow" | "pilot" | "ga"
  funding_rate_threshold NUMERIC,
  liquidation_price_band JSONB,
  max_leverage_in_regime NUMERIC,
  circuit_breaker_action TEXT,                        -- "halt" | "downsize" | "rebalance" | null

  -- ─── Provenance + promotion chain ────────────────────────────────────────
  provenance_class TEXT NOT NULL
    CHECK (provenance_class IN ('operator_authored_realtime',
                                'journal_distilled_backfill',
                                'coach_provisional')),
  backfill_source TEXT,                               -- REQUIRED iff class = journal_distilled_backfill
  operator_confirmed BOOLEAN NOT NULL DEFAULT TRUE,   -- false for coach_provisional until promoted
  promoted_at TIMESTAMPTZ,                            -- set when coach_provisional is promoted
  promotion_event_id BIGINT REFERENCES accretions(id),  -- self-ref to provisional being promoted

  -- ─── Forward-compat catch-all ────────────────────────────────────────────
  raw JSONB,

  CONSTRAINT backfill_source_required CHECK (
    provenance_class != 'journal_distilled_backfill' OR backfill_source IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_accretions_canonical
  ON accretions(canonical_path, appended_at DESC);
CREATE INDEX IF NOT EXISTS idx_accretions_scope
  ON accretions(canonical_path, scope_key, appended_at DESC);
CREATE INDEX IF NOT EXISTS idx_accretions_provenance
  ON accretions(provenance_class);
CREATE INDEX IF NOT EXISTS idx_accretions_unconfirmed
  ON accretions(canonical_path, appended_at DESC)
  WHERE operator_confirmed = FALSE;

COMMENT ON TABLE accretions IS
  'Accretive Retrieval store — append-never-mutate operator-authored modifications to canonical artifacts. See docs/ACCRETIVE-RETROFIT-SPEC-2026-05-24.md.';
COMMENT ON COLUMN accretions.canonical_path IS
  'Logical identifier (NOT filesystem path). E.g., "aletheia.weights", "regime-preset:chop-day", "per-symbol:BTC-USDT".';
COMMENT ON COLUMN accretions.promotion_event_id IS
  'When a coach_provisional is operator-confirmed, the new operator_authored_realtime row points here. Provisional row is NEVER mutated.';

INSERT INTO schema_migrations (version, description) VALUES
  ('0035_accretions',
   'Accretive retrieval store — per-canonical_path operator modifications, append-never-mutate, PG-first.')
ON CONFLICT (version) DO NOTHING;

COMMIT;
