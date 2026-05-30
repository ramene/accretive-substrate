// Package highdissentpersistence — Go observer for persistent per-symbol
// specialist disagreement.
package highdissentpersistence

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers"
)

const (
	Name                    = "high-dissent-persistence"
	DefaultDissentThreshold = 0.5
)

type Detection struct {
	Symbol          string  `json:"symbol"`
	N               int     `json:"n"`
	AvgDissent      float64 `json:"avg_dissent"`
	DeliberationIDs []int64 `json:"deliberation_ids"`
	FirstSeenAt     string  `json:"first_seen_at"`
	LastSeenAt      string  `json:"last_seen_at"`
}

func Detect(ctx context.Context, pool *pgxpool.Pool, n, windowMinutes int, dissentThreshold float64) ([]Detection, error) {
	if n <= 0 {
		n = observers.DefaultNThreshold
	}
	if windowMinutes <= 0 {
		windowMinutes = observers.DefaultWindowMinutes
	}
	if dissentThreshold <= 0 {
		dissentThreshold = DefaultDissentThreshold
	}
	rows, err := pool.Query(ctx, `
		SELECT symbol, COUNT(*)::int,
		       AVG((adjudication->>'dissent_score')::float)::float,
		       ARRAY_AGG(id ORDER BY ts), MIN(ts)::text, MAX(ts)::text
		FROM deliberations
		WHERE ts > NOW() - (($1)::int || ' minutes')::interval
		  AND symbol IS NOT NULL
		  AND (adjudication->>'dissent_score')::float > $3
		GROUP BY symbol
		HAVING COUNT(*) >= $2`, windowMinutes, n, dissentThreshold,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Detection{}
	for rows.Next() {
		var d Detection
		if err := rows.Scan(&d.Symbol, &d.N, &d.AvgDissent, &d.DeliberationIDs, &d.FirstSeenAt, &d.LastSeenAt); err != nil {
			return nil, err
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
	detected, err := Detect(ctx, pool, observers.DefaultNThreshold, observers.DefaultWindowMinutes, DefaultDissentThreshold)
	if err != nil {
		out.Errors = 1
		return out
	}
	out.Detected = len(detected)
	for _, d := range detected {
		path := "per-symbol:" + d.Symbol
		if observers.IsInCooldown(ctx, pool, path, observers.DefaultCooldownMinutes) {
			out.Skipped++
			continue
		}
		fact := fmt.Sprintf("High persistent dissent on %s: %d deliberations in last %dmin with avg dissent %.2f — specialists fundamentally disagree, strategy review recommended",
			d.Symbol, d.N, observers.DefaultWindowMinutes, d.AvgDissent)
		evidence := map[string]any{
			"deliberation_ids":   d.DeliberationIDs,
			"n_occurrences":      d.N,
			"avg_dissent_score":  d.AvgDissent,
			"window":             fmt.Sprintf("%dmin", observers.DefaultWindowMinutes),
			"first_seen_at":      d.FirstSeenAt,
			"last_seen_at":       d.LastSeenAt,
		}
		if err := observers.EmitProvisional(ctx, pool, path, fact, Name, evidence); err != nil {
			out.Errors++
			continue
		}
		out.Emitted++
	}
	return out
}
