// PG store — InsertDeliberation matching the @accretive-substrate/deliberation Node insert.
//
// Graceful: returns (0, nil) when pool is nil. Errors are wrapped so the
// orchestrator can include them in RunResult.PersistError without
// blocking the verdict.
package deliberation

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// InsertDeliberation persists one deliberation row. Returns (id, error).
// On nil pool or marshal failure, returns (0, error) and caller treats
// as non-fatal.
func InsertDeliberation(ctx context.Context, pool *pgxpool.Pool, row DeliberationRow) (int64, error) {
	if pool == nil {
		return 0, fmt.Errorf("pg-unavailable")
	}

	evidenceJSON, err := json.Marshal(row.EvidencePackage)
	if err != nil {
		return 0, fmt.Errorf("marshal evidence_package: %w", err)
	}
	voicesJSON, err := json.Marshal(row.Voices)
	if err != nil {
		return 0, fmt.Errorf("marshal voices: %w", err)
	}
	adjJSON, err := json.Marshal(row.Adjudication)
	if err != nil {
		return 0, fmt.Errorf("marshal adjudication: %w", err)
	}
	guardJSON, err := json.Marshal(row.GuardrailResult)
	if err != nil {
		return 0, fmt.Errorf("marshal guardrail_result: %w", err)
	}

	var id int64
	q := `INSERT INTO deliberations (
		source_pipeline, trigger_kind, symbol, venue, agent_id,
		evidence_package, voices, adjudication, guardrail_result,
		final_verdict, trade_ref, trade_ref_table,
		library_version, schema_version
	) VALUES (
		$1, $2, $3, $4, $5,
		$6, $7, $8, $9,
		$10, $11, $12,
		$13, $14
	) RETURNING id`
	row.LibraryVersion = LibraryVersion
	if row.SchemaVersion == "" {
		row.SchemaVersion = "v1"
	}
	err = pool.QueryRow(ctx, q,
		string(row.SourcePipeline), string(row.TriggerKind), row.Symbol, row.Venue, row.AgentID,
		evidenceJSON, voicesJSON, adjJSON, guardJSON,
		string(row.FinalVerdict), row.TradeRef, row.TradeRefTable,
		row.LibraryVersion, row.SchemaVersion,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert deliberation: %w", err)
	}
	return id, nil
}
