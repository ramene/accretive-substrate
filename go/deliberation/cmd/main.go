// mae-deliberation — Cloud Run service hosting the Go side of the Phase B
// deliberation loop. Path B (dual-mode): writes deliberations rows to the
// SHADOW DB (mae-db @ <shadow-deployment>) while the Node side writes to LIVE.
//
// Endpoints:
//
//   /health
//     Cloud-Run-required liveness check. Returns 200 OK + "ok".
//
//   /deliberate (POST)
//     Body: JSON {"evidence": {...}, "source_pipeline": "go"}
//     Returns: RunResult JSON.
//     Used by <engine-service> + monitors in B4.Go to fire deliberations.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

func main() {
	mux := http.NewServeMux()

	// Lazy-init pool. Per [[feedback_graceful_boot_no_fatal_on_db_ping]],
	// never FATAL on boot — Cloud Run cold-dial regularly >10s.
	var pool *pgxpool.Pool
	if cs := os.Getenv("DATABASE_URL"); cs != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		p, err := pgxpool.New(ctx, cs)
		cancel()
		if err != nil {
			log.Printf("[mae-deliberation] WARN pool init failed (continuing): %v", err)
		} else {
			pool = p
			log.Printf("[mae-deliberation] PG pool ready")
		}
	} else {
		log.Printf("[mae-deliberation] WARN no DATABASE_URL — deliberation will run, persist will return non-fatal error")
	}

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("/deliberate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		var in deliberation.RunInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "invalid JSON body: "+err.Error(), http.StatusBadRequest)
			return
		}
		if in.SourcePipeline == "" {
			in.SourcePipeline = deliberation.PipelineGo
		}

		opts := deliberation.RunOptions{
			Persist: func(ctx context.Context, row deliberation.DeliberationRow) (int64, error) {
				return deliberation.InsertDeliberation(ctx, pool, row)
			},
		}
		result := deliberation.RunDeliberation(r.Context(), in, opts)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	log.Printf("[mae-deliberation] listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[mae-deliberation] FATAL listen: %v", err)
	}
}
