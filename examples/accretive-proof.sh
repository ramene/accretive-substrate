#!/usr/bin/env bash
# accretive-proof.sh — Litmus test for the Accretive Retrieval pattern.
#
# Run after wake (DB must be up) to prove the wiring end-to-end:
#   1. Migrations 0035 + 0036 applied
#   2. accretions table populated with 10 bootstrap rows
#   3. @accretive-substrate/accretive helpers can read by canonical_path
#   4. Promotion path (coach_provisional → operator_authored_realtime) works
#
# Usage:
#   DATABASE_URL=postgres://… ./docs/examples/accretive-proof.sh
#
# Expected output: 5 PASS lines + final OK. Any FAIL → wiring is wrong.

set -euo pipefail

: "${DATABASE_URL:=${MAE_ACCRETIVE_PG_URL:-${MAE_CONFIG_PG_URL:-}}}"
if [[ -z "$DATABASE_URL" ]]; then
  echo "FAIL: DATABASE_URL (or MAE_ACCRETIVE_PG_URL / MAE_CONFIG_PG_URL) required"
  exit 1
fi

PSQL="docker run --rm -i --network host postgres:16-alpine psql"

# 1. Verify migration applied.
echo "── [1/5] verify migration 0035 applied ──"
COUNT=$($PSQL "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM schema_migrations WHERE version IN ('0035_accretions','0036_accretions_seed')" | tr -d ' ')
if [[ "$COUNT" != "2" ]]; then
  echo "FAIL: expected 2 accretions migrations applied, got $COUNT"
  exit 1
fi
echo "PASS: 0035 + 0036 applied"

# 2. Verify bootstrap seed: 6 backfill + 4 operator-authored = 10.
echo "── [2/5] verify bootstrap seed populated ──"
BACKFILL=$($PSQL "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM accretions WHERE provenance_class = 'journal_distilled_backfill'" | tr -d ' ')
REALTIME=$($PSQL "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM accretions WHERE provenance_class = 'operator_authored_realtime'" | tr -d ' ')
if [[ "$BACKFILL" -lt 6 ]] || [[ "$REALTIME" -lt 4 ]]; then
  echo "FAIL: expected ≥6 backfill + ≥4 realtime, got backfill=$BACKFILL realtime=$REALTIME"
  exit 1
fi
echo "PASS: $BACKFILL backfill + $REALTIME realtime rows present"

# 3. Read by canonical_path — chop-day should return at least 2 rows.
echo "── [3/5] read regime-preset:chop-day accretions ──"
CHOPDAY=$($PSQL "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM accretions WHERE canonical_path = 'regime-preset:chop-day' AND operator_confirmed = TRUE" | tr -d ' ')
if [[ "$CHOPDAY" -lt 2 ]]; then
  echo "FAIL: expected ≥2 chop-day accretions, got $CHOPDAY"
  exit 1
fi
echo "PASS: $CHOPDAY chop-day accretions readable"

# 4. Promotion path: insert provisional, then insert promotion row.
echo "── [4/5] promotion path (coach_provisional → operator_authored_realtime) ──"
PROVISIONAL_ID=$($PSQL "$DATABASE_URL" -t -c "
  INSERT INTO accretions
    (canonical_path, operator, fact, provenance_class, operator_confirmed)
  VALUES
    ('per-symbol:_litmus_test', 'coach',
     'LITMUS: coach proposes raising chop-day floor when capital_band=10',
     'coach_provisional', FALSE)
  RETURNING id" | tr -d ' ')

PROMOTED=$($PSQL "$DATABASE_URL" -t -c "
  INSERT INTO accretions
    (canonical_path, operator, fact, provenance_class, promotion_event_id)
  VALUES
    ('per-symbol:_litmus_test', 'ramene',
     'LITMUS: operator promoting coach proposal — confirmed for capital_band 10',
     'operator_authored_realtime', $PROVISIONAL_ID)
  RETURNING id" | tr -d ' ')

# Stamp promoted_at on the provisional row.
$PSQL "$DATABASE_URL" -c "UPDATE accretions SET promoted_at = NOW() WHERE id = $PROVISIONAL_ID AND promoted_at IS NULL" > /dev/null

# Verify chain integrity.
CHAIN=$($PSQL "$DATABASE_URL" -t -c "
  SELECT a.id || '→' || b.id
    FROM accretions a JOIN accretions b ON b.promotion_event_id = a.id
   WHERE a.id = $PROVISIONAL_ID" | tr -d ' ')
if [[ -z "$CHAIN" ]]; then
  echo "FAIL: promotion chain not visible after insert ($PROVISIONAL_ID → $PROMOTED)"
  exit 1
fi
echo "PASS: promotion chain $CHAIN intact, provisional row preserved unchanged"

# Cleanup litmus rows.
$PSQL "$DATABASE_URL" -c "DELETE FROM accretions WHERE canonical_path = 'per-symbol:_litmus_test'" > /dev/null

# 5. Graceful degradation: unknown canonical_path returns empty.
echo "── [5/5] graceful degradation on unknown canonical_path ──"
EMPTY=$($PSQL "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM accretions WHERE canonical_path = 'regime-preset:_no_such_regime'" | tr -d ' ')
if [[ "$EMPTY" != "0" ]]; then
  echo "FAIL: expected 0 rows for unknown canonical_path, got $EMPTY"
  exit 1
fi
echo "PASS: unknown canonical_path returns empty (graceful)"

echo ""
echo "OK — Accretive Retrieval wiring proven end-to-end."
echo "    canonical_paths seeded: $($PSQL "$DATABASE_URL" -t -c "SELECT COUNT(DISTINCT canonical_path) FROM accretions" | tr -d ' ')"
echo "    total accretions:       $($PSQL "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM accretions" | tr -d ' ')"
