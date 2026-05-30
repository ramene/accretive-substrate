// Package verdictflipflop — Go observer for per-symbol directional whipsaw.
package verdictflipflop

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers"
)

const (
	Name           = "verdict-flip-flop"
	DefaultNFlipFlop = 4 // higher than DefaultNThreshold: flip-flop requires more samples
)

type Detection struct {
	Symbol           string   `json:"symbol"`
	N                int      `json:"n"`
	DistinctVerdicts int      `json:"distinct_verdicts"`
	VerdictSet       []string `json:"verdict_set"`
	DeliberationIDs  []int64  `json:"deliberation_ids"`
	FirstSeenAt      string   `json:"first_seen_at"`
	LastSeenAt       string   `json:"last_seen_at"`
}

func Detect(ctx context.Context, pool *pgxpool.Pool, n, windowMinutes int) ([]Detection, error) {
	if n <= 0 {
		n = DefaultNFlipFlop
	}
	if windowMinutes <= 0 {
		windowMinutes = observers.DefaultWindowMinutes
	}
	rows, err := pool.Query(ctx, `
		SELECT symbol, COUNT(*)::int,
		       COUNT(DISTINCT adjudication->>'verdict')::int,
		       ARRAY_AGG(id ORDER BY ts), MIN(ts)::text, MAX(ts)::text,
		       ARRAY_AGG(DISTINCT adjudication->>'verdict')
		FROM deliberations
		WHERE ts > NOW() - (($1)::int || ' minutes')::interval
		  AND symbol IS NOT NULL
		  AND adjudication->>'verdict' IN ('buy', 'sell')
		GROUP BY symbol
		HAVING COUNT(*) >= $2
		   AND COUNT(DISTINCT adjudication->>'verdict') > 1`,
		windowMinutes, n,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Detection{}
	for rows.Next() {
		var d Detection
		if err := rows.Scan(&d.Symbol, &d.N, &d.DistinctVerdicts, &d.DeliberationIDs, &d.FirstSeenAt, &d.LastSeenAt, &d.VerdictSet); err != nil {
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
	detected, err := Detect(ctx, pool, DefaultNFlipFlop, observers.DefaultWindowMinutes)
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
		fact := fmt.Sprintf("Verdict flip-flop on %s: %d deliberations in last %dmin with both %s — strategy clarification recommended",
			d.Symbol, d.N, observers.DefaultWindowMinutes, strings.Join(d.VerdictSet, " AND "))
		evidence := map[string]any{
			"deliberation_ids":  d.DeliberationIDs,
			"n_occurrences":     d.N,
			"distinct_verdicts": d.DistinctVerdicts,
			"verdict_set":       d.VerdictSet,
			"window":            fmt.Sprintf("%dmin", observers.DefaultWindowMinutes),
			"first_seen_at":     d.FirstSeenAt,
			"last_seen_at":      d.LastSeenAt,
		}
		if err := observers.EmitProvisional(ctx, pool, path, fact, Name, evidence); err != nil {
			out.Errors++
			continue
		}
		out.Emitted++
	}
	return out
}
