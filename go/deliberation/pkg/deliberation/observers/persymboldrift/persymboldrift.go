// Package persymboldrift — Go observer that detects per-symbol verdict
// drift in the deliberations table and emits coach_provisional accretions.
//
// Mirrors @accretive-substrate/deliberation/observers/per-symbol-drift.mjs:
//   - Pattern: symbol × adjudication.verdict appearing N times in window
//   - N=3, window=30min, cooldown=30min per canonical_path
//   - Emits coach_provisional accretion with evidence_refs JSONB
//
// Cross-language parity: Node observer writes to LIVE DB (via node);
// Go observer writes to SHADOW DB (via this Cloud Run service). The
// parity reporter compares emission rates + canonical_path distributions
// in B6.
package persymboldrift

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	DefaultNThreshold      = 3
	DefaultWindowMinutes   = 30
	DefaultCooldownMinutes = 30
)

// Drift — one detected pattern (symbol + verdict + occurrence count).
type Drift struct {
	Symbol         string  `json:"symbol"`
	Verdict        string  `json:"verdict"`
	N              int     `json:"n"`
	FirstSeenAt    string  `json:"first_seen_at"`
	LastSeenAt     string  `json:"last_seen_at"`
	DeliberationIDs []int64 `json:"deliberation_ids"`
}

// DetectOptions — tuning for Detect().
type DetectOptions struct {
	NThreshold     int
	WindowMinutes  int
}

// Detect runs the pattern-detection query. Returns empty slice on PG miss
// (graceful — observer is best-effort).
func Detect(ctx context.Context, pool *pgxpool.Pool, opts DetectOptions) ([]Drift, error) {
	if pool == nil {
		return nil, nil
	}
	n := opts.NThreshold
	if n <= 0 {
		n = DefaultNThreshold
	}
	win := opts.WindowMinutes
	if win <= 0 {
		win = DefaultWindowMinutes
	}

	rows, err := pool.Query(ctx, `
		SELECT
			symbol,
			adjudication->>'verdict' AS verdict,
			COUNT(*)::int AS n,
			MIN(ts)::text AS first_seen_at,
			MAX(ts)::text AS last_seen_at,
			ARRAY_AGG(id ORDER BY ts) AS deliberation_ids
		FROM deliberations
		WHERE ts > NOW() - (($1)::int || ' minutes')::interval
		  AND symbol IS NOT NULL
		  AND adjudication->>'verdict' IN ('buy', 'sell')
		GROUP BY symbol, adjudication->>'verdict'
		HAVING COUNT(*) >= $2`,
		win, n,
	)
	if err != nil {
		return nil, fmt.Errorf("detect query: %w", err)
	}
	defer rows.Close()

	out := []Drift{}
	for rows.Next() {
		var d Drift
		if err := rows.Scan(&d.Symbol, &d.Verdict, &d.N, &d.FirstSeenAt, &d.LastSeenAt, &d.DeliberationIDs); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		out = append(out, d)
	}
	return out, nil
}

// isInCooldown returns true if a provisional accretion was emitted for
// canonicalPath within the cooldown window.
func isInCooldown(ctx context.Context, pool *pgxpool.Pool, canonicalPath string, cooldownMinutes int) bool {
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

// emitAccretion inserts one coach_provisional accretion row.
func emitAccretion(ctx context.Context, pool *pgxpool.Pool, canonicalPath, fact string, evidenceRefs map[string]any) error {
	raw, err := json.Marshal(map[string]any{
		"evidence_refs":    evidenceRefs,
		"observer":         "per-symbol-drift",
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

// Result — outcome of one observer run.
type Result struct {
	Detected  int      `json:"detected"`
	Emitted   int      `json:"emitted"`
	Skipped   int      `json:"skipped"`
	Errors    int      `json:"errors"`
	Drifts    []Drift  `json:"drifts,omitempty"`
}

// Run executes the observer end-to-end.
func Run(ctx context.Context, pool *pgxpool.Pool, opts DetectOptions) Result {
	out := Result{Drifts: []Drift{}}
	if pool == nil {
		return out
	}
	drifts, err := Detect(ctx, pool, opts)
	if err != nil {
		log.Printf("[observer:per-symbol-drift] detect failed: %v", err)
		out.Errors = 1
		return out
	}
	out.Detected = len(drifts)
	cooldown := DefaultCooldownMinutes
	win := opts.WindowMinutes
	if win <= 0 {
		win = DefaultWindowMinutes
	}

	for _, d := range drifts {
		canonicalPath := "per-symbol:" + d.Symbol
		if isInCooldown(ctx, pool, canonicalPath, cooldown) {
			out.Skipped++
			continue
		}
		fact := fmt.Sprintf("Verdict drift: %s adjudicated %s %d times in last %dmin — coach proposes per-symbol rule review",
			d.Symbol, d.Verdict, d.N, win)
		evidence := map[string]any{
			"deliberation_ids": d.DeliberationIDs,
			"n_occurrences":    d.N,
			"window":           fmt.Sprintf("%dmin", win),
			"first_seen_at":    d.FirstSeenAt,
			"last_seen_at":     d.LastSeenAt,
		}
		if err := emitAccretion(ctx, pool, canonicalPath, fact, evidence); err != nil {
			log.Printf("[observer:per-symbol-drift] emit failed: %v", err)
			out.Errors++
			continue
		}
		out.Emitted++
		out.Drifts = append(out.Drifts, d)
	}
	return out
}
