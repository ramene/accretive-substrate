// Package aletheia — Go port of @accretive-substrate/deliberation/specialists/aletheia.
//
// Verdict logic mirrors the Node side. Citation shape + auto-block floor
// (0.45) come from Phase A memory project_aletheia_auto_block_default.
package aletheia

import (
	"fmt"
	"math"
	"strings"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const (
	Name             = "aletheia"
	AutoBlockFloor   = 0.45
)

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	signals := pkg.Signals
	if len(signals) == 0 {
		return deliberation.AbstainBecause(Name, "no signals in evidence package")
	}
	if pkg.AletheiaState == nil || len(pkg.AletheiaState.Weights.Sources) == 0 {
		return deliberation.AbstainBecause(Name, "no aletheia weights available — DB miss")
	}
	weights := pkg.AletheiaState.Weights.Sources

	citations := []deliberation.Citation{{
		Type:        "aletheia_weight",
		SourceCount: len(weights),
	}}

	// Cite aletheia.weights accretions in scope.
	for _, a := range pkg.Accretions {
		if a.CanonicalPath == "aletheia.weights" {
			citations = append(citations, deliberation.Citation{
				Type:          "accretion",
				ID:            a.ID,
				CanonicalPath: a.CanonicalPath,
			})
		}
	}

	var buyScore, sellScore, maxWeight float64
	for _, s := range signals {
		w := lookupWeight(weights, s.Source)
		if w > maxWeight {
			maxWeight = w
		}
		dirSign := dirSign(s.Direction)
		contribution := w * s.Confidence * math.Abs(float64(dirSign))
		if dirSign > 0 {
			buyScore += contribution
		} else if dirSign < 0 {
			sellScore += contribution
		}
		citations = append(citations, deliberation.Citation{
			Type:       "signal",
			Source:     s.Source,
			Direction:  s.Direction,
			Confidence: s.Confidence,
		})
	}

	if maxWeight < AutoBlockFloor {
		return deliberation.AbstainBecause(Name,
			fmt.Sprintf("max source weight %.2f below auto-block floor %.2f", maxWeight, AutoBlockFloor))
	}

	total := buyScore + sellScore
	if total == 0 {
		return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.4,
			fmt.Sprintf("signals all neutral or unrecognized direction (n=%d)", len(signals)), citations)
	}

	buyShare := buyScore / total
	sellShare := sellScore / total
	consensusConf := math.Min(0.95, math.Max(buyShare, sellShare))

	if buyShare > 0.6 {
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, consensusConf,
			fmt.Sprintf("%d signals, weighted buy share %.0f%%, max weight %.2f",
				len(signals), buyShare*100, maxWeight),
			citations)
	}
	if sellShare > 0.6 {
		return deliberation.VoteFor(Name, deliberation.VerdictSell, consensusConf,
			fmt.Sprintf("%d signals, weighted sell share %.0f%%, max weight %.2f",
				len(signals), sellShare*100, maxWeight),
			citations)
	}
	return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.5,
		fmt.Sprintf("mixed signal directions: buy %.0f%% vs sell %.0f%%", buyShare*100, sellShare*100),
		citations)
}

func lookupWeight(weights map[string]float64, source string) float64 {
	if w, ok := weights[source]; ok {
		return w
	}
	if w, ok := weights[strings.ToLower(source)]; ok {
		return w
	}
	return 0
}

func dirSign(dir string) int {
	d := strings.ToLower(dir)
	if strings.HasPrefix(d, "bull") || d == "buy" {
		return 1
	}
	if strings.HasPrefix(d, "bear") || d == "sell" {
		return -1
	}
	return 0
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)
