// Specialist helpers — MakeSafe wrapper, AbstainBecause, VoteFor.
// Live in the parent package (not a subpackage) so specialist subpackages
// can import them without creating an import cycle through specialists/.
package deliberation

import "fmt"

// MakeSafe wraps an argue function. Panics become abstain voices. Invalid
// verdicts coerce to abstain. Confidence clamps to [0, 1].
func MakeSafe(name string, argue ArgueFn) ArgueFn {
	return func(pkg EvidencePackage) (out Voice) {
		defer func() {
			if r := recover(); r != nil {
				out = AbstainBecause(name, fmt.Sprintf("argue() panicked: %v", r))
			}
		}()
		voice := argue(pkg)
		voice.Specialist = name
		switch voice.Verdict {
		case VerdictBuy, VerdictSell, VerdictHold, VerdictAbstain:
			// ok
		default:
			return AbstainBecause(name, fmt.Sprintf("invalid verdict %q from argue()", voice.Verdict))
		}
		if voice.Verdict == VerdictAbstain && (voice.AbstainedBecause == nil || *voice.AbstainedBecause == "") {
			return AbstainBecause(name, "abstained without reason")
		}
		if voice.Confidence < 0 {
			voice.Confidence = 0
		} else if voice.Confidence > 1 {
			voice.Confidence = 1
		}
		if voice.Citations == nil {
			voice.Citations = []Citation{}
		}
		return voice
	}
}

// AbstainBecause builds a clean abstain Voice.
func AbstainBecause(name, reason string) Voice {
	r := reason
	return Voice{
		Specialist:       name,
		Verdict:          VerdictAbstain,
		Confidence:       0,
		Rationale:        reason,
		Citations:        []Citation{},
		AbstainedBecause: &r,
	}
}

// VoteFor builds a verdict Voice.
func VoteFor(name string, verdict Verdict, confidence float64, rationale string, citations []Citation) Voice {
	if verdict == VerdictAbstain {
		return AbstainBecause(name, rationale)
	}
	if confidence < 0 {
		confidence = 0
	} else if confidence > 1 {
		confidence = 1
	}
	if citations == nil {
		citations = []Citation{}
	}
	return Voice{
		Specialist:       name,
		Verdict:          verdict,
		Confidence:       confidence,
		Rationale:        rationale,
		Citations:        citations,
		AbstainedBecause: nil,
	}
}
