// Package specialistdissent — Go observer for repeated specialist
// disagreement with the adjudicated majority.
package specialistdissent

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers"
)

const Name = "specialist-dissent"

type Detection struct {
	Specialist      string  `json:"specialist"`
	Verdict         string  `json:"verdict"`
	N               int     `json:"n"`
	DeliberationIDs []int64 `json:"deliberation_ids"`
	FirstSeenAt     string  `json:"first_seen_at"`
	LastSeenAt      string  `json:"last_seen_at"`
}

func Detect(ctx context.Context, pool *pgxpool.Pool, n, windowMinutes int) ([]Detection, error) {
	if n <= 0 {
		n = observers.DefaultNThreshold
	}
	if windowMinutes <= 0 {
		windowMinutes = observers.DefaultWindowMinutes
	}
	rows, err := pool.Query(ctx, `
		SELECT voice->>'specialist', voice->>'verdict', COUNT(*)::int,
		       ARRAY_AGG(d.id ORDER BY d.ts), MIN(d.ts)::text, MAX(d.ts)::text
		FROM deliberations d, jsonb_array_elements(d.voices) AS voice
		WHERE d.ts > NOW() - (($1)::int || ' minutes')::interval
		  AND voice->>'verdict' NOT IN ('abstain', 'hold')
		  AND voice->>'verdict' != d.adjudication->>'verdict'
		GROUP BY voice->>'specialist', voice->>'verdict'
		HAVING COUNT(*) >= $2`, windowMinutes, n,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Detection{}
	for rows.Next() {
		var d Detection
		if err := rows.Scan(&d.Specialist, &d.Verdict, &d.N, &d.DeliberationIDs, &d.FirstSeenAt, &d.LastSeenAt); err != nil {
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
	detected, err := Detect(ctx, pool, observers.DefaultNThreshold, observers.DefaultWindowMinutes)
	if err != nil {
		out.Errors = 1
		return out
	}
	out.Detected = len(detected)
	for _, d := range detected {
		path := "gate-def:" + d.Specialist + "-weight"
		if observers.IsInCooldown(ctx, pool, path, observers.DefaultCooldownMinutes) {
			out.Skipped++
			continue
		}
		fact := fmt.Sprintf("Specialist %s dissented %s %d times in last %dmin against majority — coach proposes weight recalibration",
			d.Specialist, d.Verdict, d.N, observers.DefaultWindowMinutes)
		evidence := map[string]any{
			"deliberation_ids": d.DeliberationIDs,
			"n_occurrences":    d.N,
			"window":           fmt.Sprintf("%dmin", observers.DefaultWindowMinutes),
			"first_seen_at":    d.FirstSeenAt,
			"last_seen_at":     d.LastSeenAt,
			"specialist":       d.Specialist,
			"dissent_verdict":  d.Verdict,
		}
		if err := observers.EmitProvisional(ctx, pool, path, fact, Name, evidence); err != nil {
			out.Errors++
			continue
		}
		out.Emitted++
	}
	return out
}
