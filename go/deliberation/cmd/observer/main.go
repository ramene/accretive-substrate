// <observer-service> — Cloud Run job that runs all observers once
// per Cloud Scheduler tick (every 5min).
//
// Path B dual-mode lifecycle: Go observer writes to SHADOW DB; Node
// observer (cron on node) writes to LIVE DB. Parity reporter
// compares emission rates in B6.
package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers/hardblockcascade"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers/highdissentpersistence"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers/persymboldrift"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers/softconflictcluster"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers/specialistdissent"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/observers/verdictflipflop"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cs := os.Getenv("DATABASE_URL")
	if cs == "" {
		log.Fatalf("[observer] FATAL: DATABASE_URL required")
	}

	pool, err := pgxpool.New(ctx, cs)
	if err != nil {
		log.Fatalf("[observer] FATAL: pool init: %v", err)
	}
	defer pool.Close()

	// 6 active observers — full B3 + 5 follow-ups in this commit.
	results := map[string]any{
		"ran_at": time.Now().UTC().Format(time.RFC3339),
	}
	totalDetected := 0
	totalEmitted := 0

	// per-symbol-drift (B3 first observer — different shape, uses DetectOptions struct).
	psd := persymboldrift.Run(ctx, pool, persymboldrift.DetectOptions{})
	results["per-symbol-drift"] = psd
	totalDetected += psd.Detected
	totalEmitted += psd.Emitted

	// The 5 follow-up observers share observers.Result + Run(ctx, pool) signature.
	for _, run := range []func(){
		func() {
			r := specialistdissent.Run(ctx, pool)
			results[specialistdissent.Name] = r
			totalDetected += r.Detected
			totalEmitted += r.Emitted
		},
		func() {
			r := hardblockcascade.Run(ctx, pool)
			results[hardblockcascade.Name] = r
			totalDetected += r.Detected
			totalEmitted += r.Emitted
		},
		func() {
			r := softconflictcluster.Run(ctx, pool)
			results[softconflictcluster.Name] = r
			totalDetected += r.Detected
			totalEmitted += r.Emitted
		},
		func() {
			r := verdictflipflop.Run(ctx, pool)
			results[verdictflipflop.Name] = r
			totalDetected += r.Detected
			totalEmitted += r.Emitted
		},
		func() {
			r := highdissentpersistence.Run(ctx, pool)
			results[highdissentpersistence.Name] = r
			totalDetected += r.Detected
			totalEmitted += r.Emitted
		},
	} {
		run()
	}

	results["total_detected"] = totalDetected
	results["total_emitted"] = totalEmitted

	payload, _ := json.Marshal(results)
	log.Printf("[observer] run complete: %s", payload)
}
