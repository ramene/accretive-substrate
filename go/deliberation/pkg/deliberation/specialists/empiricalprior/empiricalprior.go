// Package empiricalprior — Go port of @accretive-substrate/deliberation/specialists/empirical-prior.
//
// Mirrors coach.mjs::applyEmpiricalPriors: reads 24h forward-return
// distribution for the signal pattern; n>=5 floor; WR<35%+median<-0.5%
// → sell, WR>65%+median>0.5% → buy, else hold.
package empiricalprior

import (
	"fmt"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const (
	Name           = "empirical-prior"
	MinN           = 5
	BearWRMax      = 35.0
	BearMedianMax  = -0.5
	BullWRMin      = 65.0
	BullMedianMin  = 0.5
)

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	priors := pkg.EmpiricalPriors
	if priors == nil || priors.H24 == nil {
		return deliberation.AbstainBecause(Name, "no 24h prior in evidence")
	}
	h24 := priors.H24

	citations := []deliberation.Citation{{
		Type:    "empirical_prior",
		Horizon: "24h",
		N:       h24.N,
		WR:      h24.WinRatePct,
		Median:  h24.MedianPct,
		Pattern: priors.Pattern,
	}}

	if h24.N < MinN {
		return deliberation.AbstainBecause(Name,
			fmt.Sprintf("n=%d below %d sample floor", h24.N, MinN))
	}

	if h24.WinRatePct < BearWRMax && h24.MedianPct < BearMedianMax {
		conf := 0.65 + (BearWRMax-h24.WinRatePct)/100 + abs(h24.MedianPct)/5
		if conf > 0.92 {
			conf = 0.92
		}
		return deliberation.VoteFor(Name, deliberation.VerdictSell, conf,
			fmt.Sprintf("empirical bear: n=%d, 24h WR=%.0f%%, median=%.2f%%",
				h24.N, h24.WinRatePct, h24.MedianPct),
			citations)
	}

	if h24.WinRatePct > BullWRMin && h24.MedianPct > BullMedianMin {
		conf := 0.65 + (h24.WinRatePct-BullWRMin)/100 + h24.MedianPct/5
		if conf > 0.92 {
			conf = 0.92
		}
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
			fmt.Sprintf("empirical bull: n=%d, 24h WR=%.0f%%, median=%.2f%%",
				h24.N, h24.WinRatePct, h24.MedianPct),
			citations)
	}

	return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.5,
		fmt.Sprintf("pattern n=%d, 24h WR=%.0f%%, median=%.2f%% — no decisive edge",
			h24.N, h24.WinRatePct, h24.MedianPct),
		citations)
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)
