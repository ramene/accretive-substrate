package deliberation

import (
	"testing"
)

func TestGuardrailCleanPass(t *testing.T) {
	r := EnforceGuardrails(EvidencePackage{
		GateState: GateState{Blocking: []string{}},
		ProposedPosition: &ProposedPosition{
			EstimatedDollar:          20,
			AgentPositionDollarFloor: 10,
		},
	}, Adjudication{Verdict: VerdictBuy})

	if !r.Passed {
		t.Error("expected passed")
	}
	if r.PolicyApplied != "no_conflicts" {
		t.Errorf("policy: %s", r.PolicyApplied)
	}
}

func TestGuardrailHardBlock(t *testing.T) {
	r := EnforceGuardrails(EvidencePackage{
		GateState: GateState{Blocking: []string{"capital_halt"}},
	}, Adjudication{Verdict: VerdictBuy})

	if r.Passed {
		t.Error("expected !passed")
	}
	if len(r.HardBlocks) != 1 || r.HardBlocks[0] != "capital_halt" {
		t.Errorf("hard_blocks: %v", r.HardBlocks)
	}
}

func TestGuardrailSoftConflictAboveThreshold(t *testing.T) {
	r := EnforceGuardrails(EvidencePackage{
		GateState: GateState{Blocking: []string{}},
		Accretions: []Accretion{
			{ID: 99, OperatorConfirmed: false, Fact: "NO BUY in this window", CanonicalPath: "x"},
		},
		ProposedPosition: &ProposedPosition{
			EstimatedDollar:          60,
			AgentPositionDollarFloor: 20,
		},
	}, Adjudication{Verdict: VerdictBuy})

	if r.PolicyApplied != "pause" {
		t.Errorf("policy expected pause, got %s", r.PolicyApplied)
	}
	if r.ExposureThreshold != 40 {
		t.Errorf("threshold expected 40, got %f", r.ExposureThreshold)
	}
}

func TestGuardrailSoftConflictBelowThreshold(t *testing.T) {
	r := EnforceGuardrails(EvidencePackage{
		Accretions: []Accretion{
			{ID: 1, OperatorConfirmed: false, Fact: "no buy", CanonicalPath: "x"},
		},
		ProposedPosition: &ProposedPosition{
			EstimatedDollar:          10,
			AgentPositionDollarFloor: 5,
		},
	}, Adjudication{Verdict: VerdictBuy})

	// floor=5, threshold=max(10, 25)=25, proposed=10 → flag
	if r.ExposureThreshold != 25 {
		t.Errorf("threshold expected 25 (absolute floor), got %f", r.ExposureThreshold)
	}
	if r.PolicyApplied != "flag" {
		t.Errorf("policy expected flag, got %s", r.PolicyApplied)
	}
}

func TestGuardrailConfirmedAccretionIgnored(t *testing.T) {
	r := EnforceGuardrails(EvidencePackage{
		Accretions: []Accretion{
			{ID: 1, OperatorConfirmed: true, Fact: "pause buys", CanonicalPath: "x"},
		},
		ProposedPosition: &ProposedPosition{
			EstimatedDollar:          100,
			AgentPositionDollarFloor: 10,
		},
	}, Adjudication{Verdict: VerdictBuy})

	if len(r.SoftConflicts) != 0 {
		t.Errorf("expected 0 soft conflicts, got %d", len(r.SoftConflicts))
	}
}

func TestFinalVerdictFor(t *testing.T) {
	if FinalVerdictFor(GuardrailResult{Passed: false, HardBlocks: []string{"x"}}, Adjudication{Verdict: VerdictBuy}) != FinalAbort {
		t.Error("hard block should abort")
	}
	if FinalVerdictFor(GuardrailResult{Passed: true, PolicyApplied: "pause"}, Adjudication{Verdict: VerdictBuy}) != FinalOperatorRequired {
		t.Error("pause should require operator")
	}
	if FinalVerdictFor(GuardrailResult{Passed: true, PolicyApplied: "no_conflicts"}, Adjudication{Verdict: VerdictHold}) != FinalHold {
		t.Error("hold verdict should be FinalHold")
	}
	if FinalVerdictFor(GuardrailResult{Passed: true, PolicyApplied: "flag"}, Adjudication{Verdict: VerdictBuy}) != FinalExecute {
		t.Error("flag should still execute")
	}
}
