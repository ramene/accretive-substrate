// Guardrail — Stage 4. Hard blocks from gate_state + soft conflicts from
// unconfirmed accretions, with operator-mandated context-aware policy
// (§10.5: pause when proposed $ > max(agent_floor × 2, $25), else flag).
package deliberation

import (
	"strings"
)

const AbsolutePauseFloor = 25.0

func EnforceGuardrails(evidence EvidencePackage, adj Adjudication) GuardrailResult {
	hardBlocks := append([]string{}, evidence.GateState.Blocking...)

	softConflicts := []SoftConflict{}
	if adj.Verdict == VerdictBuy || adj.Verdict == VerdictSell {
		for _, a := range evidence.Accretions {
			if a.OperatorConfirmed {
				continue
			}
			fact := strings.ToLower(a.Fact)
			var opposes bool
			switch adj.Verdict {
			case VerdictBuy:
				opposes = strings.Contains(fact, "no buy") ||
					strings.Contains(fact, "block buy") ||
					strings.Contains(fact, "pause buys")
			case VerdictSell:
				opposes = strings.Contains(fact, "no sell") ||
					strings.Contains(fact, "block sell") ||
					strings.Contains(fact, "hold position")
			}
			if opposes {
				softConflicts = append(softConflicts, SoftConflict{
					AccretionID:   a.ID,
					CanonicalPath: a.CanonicalPath,
					Fact:          a.Fact,
				})
			}
		}
	}

	var floor float64
	if evidence.ProposedPosition != nil {
		floor = evidence.ProposedPosition.AgentPositionDollarFloor
	}
	exposureThreshold := floor * 2
	if exposureThreshold < AbsolutePauseFloor {
		exposureThreshold = AbsolutePauseFloor
	}
	var proposedDollar float64
	if evidence.ProposedPosition != nil {
		proposedDollar = evidence.ProposedPosition.EstimatedDollar
	}

	policy := "no_conflicts"
	if len(softConflicts) > 0 {
		if proposedDollar > exposureThreshold {
			policy = "pause"
		} else {
			policy = "flag"
		}
	}

	return GuardrailResult{
		Passed:            len(hardBlocks) == 0,
		HardBlocks:        hardBlocks,
		SoftConflicts:     softConflicts,
		ExposureThreshold: exposureThreshold,
		ProposedDollar:    proposedDollar,
		PolicyApplied:     policy,
	}
}

// FinalVerdictFor — Stage 5 decision: which final_verdict applies.
func FinalVerdictFor(g GuardrailResult, adj Adjudication) FinalVerdict {
	if !g.Passed {
		return FinalAbort
	}
	if g.PolicyApplied == "pause" {
		return FinalOperatorRequired
	}
	if adj.Verdict == VerdictHold {
		return FinalHold
	}
	return FinalExecute
}
