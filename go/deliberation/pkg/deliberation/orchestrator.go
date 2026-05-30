// Orchestrator — the 6-stage RunDeliberation entry point.
//
// Mirrors Node @accretive-substrate/deliberation/orchestrator.mjs runDeliberation():
//   1. Validate input
//   2. Call all active specialists (Stage 2)
//   3. Adjudicate voices (Stage 3)
//   4. Enforce guardrails (Stage 4)
//   5. Persist deliberation row (Stage 5)
//   6. Return RunResult (Stage 6 observer is in B3.Go)
//
// Persistence failure NEVER blocks the returned verdict.
package deliberation

import (
	"context"
	"sync"
)

const LibraryVersion = "@accretive-substrate/deliberation@1.0.0-go"

// PersistFn — the deliberation row writer. Defaults to InsertDeliberation
// (PG-backed) but tests inject in-memory implementations.
type PersistFn func(ctx context.Context, row DeliberationRow) (int64, error)

// RunOptions — knobs for RunDeliberation.
type RunOptions struct {
	// Specialists is the ordered slice of ArgueFn invocations to run.
	// Caller (main.go, tests) supplies — typically `specialists.Active`.
	// Empty slice yields zero voices → adjudication returns hold/0.
	Specialists       []ArgueFn
	Brain             BrainFn
	DissentThreshold  float64
	Persist           PersistFn
}

// callAllSpecialists is moved here from the specialists subpackage to keep
// the orchestrator free of imports of specialists. Specialists package
// re-exports CallAll() as a thin wrapper for callers that want a default-
// active set.
func callAllSpecialists(_ context.Context, pkg EvidencePackage, set []ArgueFn) []Voice {
	voices := make([]Voice, len(set))
	var wg sync.WaitGroup
	for i, fn := range set {
		wg.Add(1)
		go func(idx int, f ArgueFn) {
			defer wg.Done()
			voices[idx] = f(pkg)
		}(i, fn)
	}
	wg.Wait()
	return voices
}

// RunInput — what runs the deliberation.
type RunInput struct {
	Evidence       EvidencePackage
	SourcePipeline SourcePipeline
	TradeRef       *int64
	TradeRefTable  string
}

// RunDeliberation — entry point matching @accretive-substrate/deliberation runDeliberation().
func RunDeliberation(ctx context.Context, in RunInput, opts RunOptions) RunResult {
	if in.SourcePipeline != PipelineNode && in.SourcePipeline != PipelineGo {
		return RunResult{FinalVerdict: FinalAbort, Error: "invalid source_pipeline"}
	}
	if in.Evidence.Trigger.Kind == "" {
		return RunResult{FinalVerdict: FinalAbort, Error: "evidence_package missing trigger.kind"}
	}

	// Stage 2 — specialists in parallel. Caller supplies the active set.
	voices := callAllSpecialists(ctx, in.Evidence, opts.Specialists)

	// Stage 3 — adjudicate.
	adj := Adjudicate(ctx, voices, AdjudicateOptions{
		Brain:            opts.Brain,
		DissentThreshold: opts.DissentThreshold,
	})

	// Stage 4 — guardrail.
	guardrail := EnforceGuardrails(in.Evidence, adj)

	// Stage 5 — persist.
	finalVerdict := FinalVerdictFor(guardrail, adj)
	row := DeliberationRow{
		SourcePipeline:  in.SourcePipeline,
		TriggerKind:     in.Evidence.Trigger.Kind,
		Symbol:          in.Evidence.Trigger.Symbol,
		Venue:           in.Evidence.Trigger.Venue,
		AgentID:         in.Evidence.Trigger.AgentID,
		EvidencePackage: in.Evidence,
		Voices:          voices,
		Adjudication:    adj,
		GuardrailResult: guardrail,
		FinalVerdict:    finalVerdict,
		TradeRef:        in.TradeRef,
		TradeRefTable:   in.TradeRefTable,
		LibraryVersion:  LibraryVersion,
		SchemaVersion:   "v1",
	}

	persist := opts.Persist
	if persist == nil {
		persist = noopPersist
	}
	id, err := persist(ctx, row)
	persistOK := err == nil && id != 0
	var pid *int64
	if persistOK {
		pid = &id
	}
	persistErr := ""
	if !persistOK {
		if err != nil {
			persistErr = err.Error()
		} else {
			persistErr = "no id returned"
		}
	}

	return RunResult{
		DeliberationID: pid,
		FinalVerdict:   finalVerdict,
		Adjudication:   adj,
		Guardrail:      guardrail,
		Voices:         voices,
		Persisted:      persistOK,
		PersistError:   persistErr,
	}
}

// noopPersist — default when caller doesn't inject a Persist option.
// Behaves like PG unavailable — RunResult.Persisted == false but verdict still returned.
func noopPersist(_ context.Context, _ DeliberationRow) (int64, error) {
	return 0, nil
}
