// Shared helpers for the 6 observer packages. Cooldown check + accretion
// emit + Result type are common — kept here so each observer file only
// holds its detect query + canonical_path / fact computation.
package observers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	DefaultNThreshold      = 3
	DefaultWindowMinutes   = 30
	DefaultCooldownMinutes = 30
)

// Result — outcome of one observer run.
type Result struct {
	Observer  string `json:"observer"`
	Detected  int    `json:"detected"`
	Emitted   int    `json:"emitted"`
	Skipped   int    `json:"skipped"`
	Errors    int    `json:"errors"`
}

// IsInCooldown returns true if a coach_provisional accretion was emitted for
// canonicalPath within the cooldown window.
func IsInCooldown(ctx context.Context, pool *pgxpool.Pool, canonicalPath string, cooldownMinutes int) bool {
	row := pool.QueryRow(ctx, `
		SELECT 1 FROM accretions
		 WHERE canonical_path = $1
		   AND provenance_class = 'coach_provisional'
		   AND appended_at > NOW() - (($2)::int || ' minutes')::interval
		 LIMIT 1`,
		canonicalPath, cooldownMinutes,
	)
	var one int
	if err := row.Scan(&one); err != nil {
		return false
	}
	return one == 1
}

// EmitProvisional inserts one coach_provisional accretion row.
//
// evidenceRefs is opaque JSON; observers structure it as a map. The
// observer name + version is stamped automatically in the raw payload.
func EmitProvisional(ctx context.Context, pool *pgxpool.Pool, canonicalPath, fact, observer string, evidenceRefs map[string]any) error {
	raw, err := json.Marshal(map[string]any{
		"evidence_refs":    evidenceRefs,
		"observer":         observer,
		"observer_version": "1.0.0-go",
	})
	if err != nil {
		return fmt.Errorf("marshal raw: %w", err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO accretions (
		  canonical_path, operator, fact, provenance_class, operator_confirmed, raw
		) VALUES ($1, $2, $3, 'coach_provisional', FALSE, $4)`,
		canonicalPath, "coach", fact, raw,
	)
	return err
}
