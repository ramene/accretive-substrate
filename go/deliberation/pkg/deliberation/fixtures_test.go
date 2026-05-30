// Cross-language fixture parity tests.
//
// Reads the SAME JSON fixture files as the Node @accretive-substrate/deliberation test
// suite (vendored copies at internal/test/fixtures/) and asserts the
// same expected_voices / expected_adjudication / expected_final_verdict.
//
// Identical assertions in Node + Go prove the cross-pipeline parity claim
// for Path B. If a future B2.Go specialist diverges from B2.Node, the
// fixture tests on both sides fail simultaneously.
package deliberation_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists"
)

type Fixture struct {
	Name                 string                       `json:"name"`
	Description          string                       `json:"description"`
	EvidencePackage      deliberation.EvidencePackage `json:"evidence_package"`
	ExpectedVoices       map[string]string            `json:"expected_voices,omitempty"`
	ExpectedAdjudication *struct {
		Verdict string `json:"verdict"`
	} `json:"expected_adjudication,omitempty"`
	ExpectedGuardrail *struct {
		PolicyApplied string `json:"policy_applied"`
	} `json:"expected_guardrail,omitempty"`
	ExpectedFinalVerdict string `json:"expected_final_verdict,omitempty"`
}

func loadFixtures(t *testing.T) []Fixture {
	t.Helper()
	dir := filepath.Join("..", "..", "internal", "test", "fixtures")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read fixture dir: %v", err)
	}
	var out []Fixture
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		var f Fixture
		if err := json.Unmarshal(raw, &f); err != nil {
			t.Fatalf("unmarshal %s: %v", e.Name(), err)
		}
		out = append(out, f)
	}
	return out
}

func TestFixtureParity(t *testing.T) {
	// B2.Go: all 8 specialists present. Cross-language parity now asserts
	// EVERY voice + full adjudication + guardrail + final verdict against
	// the same fixture files as the Node @accretive-substrate/deliberation suite.
	// This is the cross-language parity proof for Path B.

	for _, f := range loadFixtures(t) {
		t.Run(f.Name, func(t *testing.T) {
			result := deliberation.RunDeliberation(context.Background(),
				deliberation.RunInput{Evidence: f.EvidencePackage, SourcePipeline: deliberation.PipelineGo},
				deliberation.RunOptions{Specialists: specialists.Active},
			)

			// Verify every voice named in expected_voices matches.
			for name, expected := range f.ExpectedVoices {
				var got string
				for _, v := range result.Voices {
					if v.Specialist == name {
						got = string(v.Verdict)
					}
				}
				if got == "" {
					t.Errorf("specialist %s did not vote", name)
					continue
				}
				if got != expected {
					t.Errorf("%s: expected %s, got %s", name, expected, got)
				}
			}

			// Adjudication.
			if f.ExpectedAdjudication != nil && f.ExpectedAdjudication.Verdict != "" {
				if string(result.Adjudication.Verdict) != f.ExpectedAdjudication.Verdict {
					t.Errorf("adjudication: expected %s, got %s",
						f.ExpectedAdjudication.Verdict, result.Adjudication.Verdict)
				}
			}

			// Guardrail.
			if f.ExpectedGuardrail != nil && f.ExpectedGuardrail.PolicyApplied != "" {
				if result.Guardrail.PolicyApplied != f.ExpectedGuardrail.PolicyApplied {
					t.Errorf("guardrail policy: expected %s, got %s",
						f.ExpectedGuardrail.PolicyApplied, result.Guardrail.PolicyApplied)
				}
			}

			// Final verdict.
			if f.ExpectedFinalVerdict != "" {
				if string(result.FinalVerdict) != f.ExpectedFinalVerdict {
					t.Errorf("final_verdict: expected %s, got %s",
						f.ExpectedFinalVerdict, result.FinalVerdict)
				}
			}
		})
	}
}
