// Package softconflictcluster — Go observer for repeated soft-conflict
// citations of the same accretion — promotion signal.
package softconflictcluster

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers"
)

const Name = "soft-conflict-cluster"

type Detection struct {
	AccretionID         int64   `json:"accretion_id"`
	ConflictCanonicalPath string  `json:"conflict_canonical_path"`
	N                   int     `json:"n"`
	DeliberationIDs     []int64 `json:"deliberation_ids"`
	FirstSeenAt         string  `json:"first_seen_at"`
	LastSeenAt          string  `json:"last_seen_at"`
}

func Detect(ctx context.Context, pool *pgxpool.Pool, n, windowMinutes int) ([]Detection, error) {
	if n <= 0 {
		n = observers.DefaultNThreshold
	}
	if windowMinutes <= 0 {
		windowMinutes = observers.DefaultWindowMinutes
	}
	rows, err := pool.Query(ctx, `
		SELECT (conflict->>'accretion_id')::bigint,
		       conflict->>'canonical_path',
		       COUNT(*)::int,
		       ARRAY_AGG(d.id ORDER BY d.ts), MIN(d.ts)::text, MAX(d.ts)::text
		FROM deliberations d, jsonb_array_elements(d.guardrail_result->'soft_conflicts') AS conflict
		WHERE d.ts > NOW() - (($1)::int || ' minutes')::interval
		  AND conflict->>'accretion_id' IS NOT NULL
		GROUP BY (conflict->>'accretion_id')::bigint, conflict->>'canonical_path'
		HAVING COUNT(*) >= $2`, windowMinutes, n,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Detection{}
	for rows.Next() {
		var d Detection
		var cp *string
		if err := rows.Scan(&d.AccretionID, &cp, &d.N, &d.DeliberationIDs, &d.FirstSeenAt, &d.LastSeenAt); err != nil {
			return nil, err
		}
		if cp != nil {
			d.ConflictCanonicalPath = *cp
		}
		out = append(out, d)
	}
	return out, nil
}

func Run(ctx context.Context, pool *pgxpool.Pool) observers.Result {
	out := observers.Result{Observer: Name}
	if pool == nil {
		return out
	}
	detected, err := Detect(ctx, pool, observers.DefaultNThreshold, observers.DefaultWindowMinutes)
	if err != nil {
		out.Errors = 1
		return out
	}
	out.Detected = len(detected)
	for _, d := range detected {
		path := fmt.Sprintf("strategy-doc:accretion-promotion-%d", d.AccretionID)
		if observers.IsInCooldown(ctx, pool, path, observers.DefaultCooldownMinutes) {
			out.Skipped++
			continue
		}
		referencedPath := d.ConflictCanonicalPath
		if referencedPath == "" {
			referencedPath = "unknown path"
		}
		fact := fmt.Sprintf("Accretion #%d (%s) cited as soft conflict %d times in last %dmin — operator review for promotion to operator_authored_realtime",
			d.AccretionID, referencedPath, d.N, observers.DefaultWindowMinutes)
		evidence := map[string]any{
			"deliberation_ids":         d.DeliberationIDs,
			"n_occurrences":            d.N,
			"window":                   fmt.Sprintf("%dmin", observers.DefaultWindowMinutes),
			"first_seen_at":            d.FirstSeenAt,
			"last_seen_at":             d.LastSeenAt,
			"referenced_accretion_id":  d.AccretionID,
			"referenced_canonical_path": d.ConflictCanonicalPath,
		}
		if err := observers.EmitProvisional(ctx, pool, path, fact, Name, evidence); err != nil {
			out.Errors++
			continue
		}
		out.Emitted++
	}
	return out
}
