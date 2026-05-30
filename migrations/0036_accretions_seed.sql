-- 0036_accretions_seed.sql  (Accretive Retrieval — bootstrap data, 2026-05-29)
--
-- Bootstrap content for the accretions table:
--   1. journal_distilled_backfill — 6 entries recovered from journal digest
--      /Users/ramene/.local/share/journal/digests/2026-05-10.md
--   2. operator_authored_realtime — 4 entries from the 2026-05-29 sleep session
--      (dogfooded: every operator decision in that session got accretive form)
--
-- Idempotent (ON CONFLICT DO NOTHING via partial-unique key strategy: we key
-- on canonical_path + fact prefix). Re-running this migration is a no-op.

BEGIN;

-- Helper: only insert if no row exists with the same canonical_path + fact prefix.
-- (Accretions are append-only by contract; we just need to make THIS seed
-- idempotent so applying the migration twice doesn't duplicate.)
CREATE TEMPORARY TABLE _seed_rows (
  canonical_path TEXT,
  operator TEXT,
  fact TEXT,
  regime_context JSONB,
  venue_scope JSONB,
  capital_band TEXT,
  trigger_event TEXT,
  provenance_class TEXT,
  backfill_source TEXT,
  appended_at TIMESTAMPTZ
);

-- ─── journal_distilled_backfill (6 entries from digest:2026-05-10) ──────────

INSERT INTO _seed_rows VALUES
  ('gate-def:session-multiplier', 'ramene',
   'Session multiplier control: env override MAE_SESSION_CONF_MULT=1.0 bypasses hardcoded 1.15× when needed. #143 regime-aware blend respects regime state while keeping session schedule. Hardcoded 1.15 ate ICP-USDT 74% signal (0.74×1.15=0.851 effective floor) on 2026-05-10.',
   NULL, '["all"]'::jsonb, NULL, 'May-10 lockdown', 'journal_distilled_backfill', 'digest:2026-05-10',
   '2026-05-10T05:43:00Z'::timestamptz),

  ('gate-def:no-shorting-kc', 'ramene',
   'Mean-reversion long-buys exempt from KC bearish-direction skip: scanner emits direction=bearish on 24h trend even when strategy is mean-reversion (long dip-buy). L1 filter MUST consult strategy semantic at gate-check time, not just signal source time. Annotate [MEAN-REV-LONG] in audit log.',
   NULL, '["kucoin"]'::jsonb, NULL, 'May-10 lockdown', 'journal_distilled_backfill', 'digest:2026-05-10',
   '2026-05-10T05:43:00Z'::timestamptz),

  ('regime-preset:chop-day', 'ramene',
   'minSignalConfidence floor lowered 0.72 → 0.65 (chop-day v5). APE/ENJ at 70-71%% were legitimate mean-reversion setups just below the floor. Preset is the operator-tunable boundary; do NOT hardcode floors in source.',
   '{"regime":"SIDEWAYS","confidence":0.98}'::jsonb, '["all"]'::jsonb, '10_25', 'May-10 lockdown',
   'journal_distilled_backfill', 'digest:2026-05-10', '2026-05-10T05:43:00Z'::timestamptz),

  ('regime-preset:chop-day', 'ramene',
   'minAletheiaWeight floor lowered 0.55 → 0.40 (chop-day v5). kucoin-scanner learned trust was 0.44 from May 6-7 losses — 0.55 floor blocked all KC signals. 0.40 floor matches empirical trust with buffer while still gating untrusted sources. Floor is operator-tunable; never bypass via code edits.',
   '{"regime":"SIDEWAYS","confidence":0.98}'::jsonb, '["kucoin"]'::jsonb, '10_25', 'May-10 lockdown',
   'journal_distilled_backfill', 'digest:2026-05-10', '2026-05-10T05:43:00Z'::timestamptz),

  ('gate-def:sit-out', 'ramene',
   'Sit-out auto-engage during cascading-rejection storms: force-off flag touch + manual state.json clear. Let watchdog clear naturally instead of indefinite pause. Anti-pattern: forcing infinite sit-out hides root cause (stacked gates).',
   NULL, '["all"]'::jsonb, NULL, 'May-10 lockdown', 'journal_distilled_backfill', 'digest:2026-05-10',
   '2026-05-10T01:26:00Z'::timestamptz),

  ('strategy-doc:PHASE-0.2.5-GATE-REGISTRY-SPEC', 'ramene',
   'Gates that silently stack into total lockdown require dashboard visibility. Gate Registry + Composition Tracer prevents this failure class: one /api/gates call shows ALL blockers, not 4 hours of manual grep. Empirical anchor: May-10 6-gate stack = 10h lockdown.',
   NULL, '["all"]'::jsonb, NULL, 'May-10 lockdown', 'journal_distilled_backfill', 'digest:2026-05-10',
   '2026-05-10T05:43:00Z'::timestamptz);

-- ─── operator_authored_realtime (4 entries from 2026-05-29 sleep session) ───

INSERT INTO _seed_rows VALUES
  ('strategy-doc:scripts/sleep-mae-full.sh', 'ramene',
   'Cron-cleanup grep must match ALL mae-touching crons, not a hand-picked subset. v1 grep ''mae-full-report.py|mae-prod-status|platform.monitor'' missed 6 of 7 mae crons (run-trading-loop, rotate-guidance-history, empirical-priors-refresh, check-enoent-regressions, parity-push-trades, mae-nightly-tearsheet). Default pattern: ''mae|trading-loop|parity-push|tearsheet|priors|guidance-history|enoent''.',
   NULL, '["all"]'::jsonb, NULL, '2026-05-29 sleep', 'operator_authored_realtime', NULL,
   '2026-05-29T18:08:00Z'::timestamptz),

  ('strategy-doc:scripts/wake-mae-full.sh', 'ramene',
   'Releasing static NAT IP saves $4/mo. Wake re-allocates a NEW external IP, requiring Binance + KuCoin allowlist update before W6 SHADOW or LIVE trading. Cloud NAT auto-allocate mode is the fallback that lets escaped traffic still egress while NAT IP is unbound.',
   NULL, '["binance","kucoin"]'::jsonb, NULL, '2026-05-29 sleep', 'operator_authored_realtime', NULL,
   '2026-05-29T18:08:00Z'::timestamptz),

  ('strategy-doc:RULES.md', 'ramene',
   'Sleep/wake scripts MUST be committed before execution. Never run from /tmp (volatile across reboots). Anti-pattern reproduced 2026-04-25 (hourly FULL REPORT lived in /tmp, fixes evaporated). Durable artifacts go in repo; scratch goes in ~/.claude-tmp/.',
   NULL, '["all"]'::jsonb, NULL, '2026-05-29 sleep', 'operator_authored_realtime', NULL,
   '2026-05-29T18:08:00Z'::timestamptz),

  ('strategy-doc:CLAUDE.md', 'ramene',
   'PM2 sleep is the only exception to "one process at a time" — when transitioning the whole platform to scale-to-zero, ''pm2 save && pm2 stop all'' is correct. Normal deploys remain one-at-a-time (per [[feedback_one_process_at_a_time]]).',
   NULL, '["all"]'::jsonb, NULL, '2026-05-29 sleep', 'operator_authored_realtime', NULL,
   '2026-05-29T18:08:00Z'::timestamptz);

-- ─── Idempotent insert: only seed rows that aren't already present ──────────

INSERT INTO accretions
  (canonical_path, operator, fact, regime_context, venue_scope,
   capital_band, trigger_event, provenance_class, backfill_source,
   operator_confirmed, appended_at)
SELECT
  s.canonical_path, s.operator, s.fact, s.regime_context, s.venue_scope,
  s.capital_band, s.trigger_event, s.provenance_class, s.backfill_source,
  TRUE, s.appended_at
FROM _seed_rows s
WHERE NOT EXISTS (
  SELECT 1 FROM accretions a
  WHERE a.canonical_path = s.canonical_path
    AND LEFT(a.fact, 80) = LEFT(s.fact, 80)
);

DROP TABLE _seed_rows;

INSERT INTO schema_migrations (version, description) VALUES
  ('0036_accretions_seed',
   'Bootstrap seed for accretions — 6 May-10 journal-distilled + 4 May-29 operator-authored.')
ON CONFLICT (version) DO NOTHING;

COMMIT;
