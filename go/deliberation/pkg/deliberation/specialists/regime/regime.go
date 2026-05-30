// Package regime — Go port of @accretive-substrate/deliberation/specialists/regime.
//
// Verdict logic MUST match the Node side byte-for-byte for the cross-
// pipeline parity claim. Fixture tests at
// <this repo>/go/deliberation/internal/test/fixtures/ are loaded by BOTH
// Node and Go suites with identical input/output assertions.
package regime

import (
	"fmt"
	"strings"
	"time"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const Name = "regime"

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	rs := pkg.RegimeState
	if rs == nil || rs.Regime == "" {
		return deliberation.AbstainBecause(Name, "no regime_state in evidence package")
	}
	regime := strings.ToUpper(rs.Regime)
	conf := rs.Confidence

	// Cite regime_state + matching regime-preset accretions.
	citations := []deliberation.Citation{{
		Type:       "regime_state",
		Regime:     regime,
		Confidence: conf,
		TS:         rs.TS,
	}}

	// Match accretions: canonical_path = regime-preset:<regime-lowercased-with-dashes>
	target := "regime-preset:" + strings.ReplaceAll(strings.ToLower(regime), "_", "-")
	for _, a := range pkg.Accretions {
		if a.CanonicalPath == target {
			citations = append(citations, deliberation.Citation{
				Type:          "accretion",
				ID:            a.ID,
				CanonicalPath: a.CanonicalPath,
			})
		}
	}

	if conf < 0.5 {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("regime conf %.2f below 0.5 floor", conf))
	}

	triggerKind := string(pkg.Trigger.Kind)
	if triggerKind == "" {
		triggerKind = "unknown"
	}

	// CRASH — always hold.
	if regime == "CRASH" && conf >= 0.8 {
		return deliberation.VoteFor(Name, deliberation.VerdictHold, conf,
			fmt.Sprintf("regime=CRASH conf=%.2f — refuse new exposure", conf), citations)
	}

	// BEAR — sell on sell_reeval, hold on buy_proposal.
	if regime == "BEAR" && conf >= 0.7 {
		if triggerKind == "sell_reeval" {
			return deliberation.VoteFor(Name, deliberation.VerdictSell, conf,
				fmt.Sprintf("regime=BEAR conf=%.2f — close on re-eval", conf), citations)
		}
		boosted := conf + 0.1
		if boosted > 0.85 {
			boosted = 0.85
		}
		return deliberation.VoteFor(Name, deliberation.VerdictHold, boosted,
			fmt.Sprintf("regime=BEAR conf=%.2f — block new buys, no add", conf), citations)
	}

	// BULL — favor buy.
	if regime == "BULL" && conf >= 0.7 {
		if triggerKind == "buy_proposal" || triggerKind == "stack_add" {
			return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
				fmt.Sprintf("regime=BULL conf=%.2f — favor entry", conf), citations)
		}
		return deliberation.VoteFor(Name, deliberation.VerdictHold, conf*0.8,
			fmt.Sprintf("regime=BULL conf=%.2f but trigger=%s not direction-aligned", conf, triggerKind), citations)
	}

	// SIDEWAYS — mean-reversion bias.
	if regime == "SIDEWAYS" && conf >= 0.7 {
		if triggerKind == "buy_proposal" || triggerKind == "stack_add" {
			return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf*0.85,
				fmt.Sprintf("regime=SIDEWAYS conf=%.2f — mean-reversion long bias", conf), citations)
		}
		if triggerKind == "sell_reeval" {
			return deliberation.VoteFor(Name, deliberation.VerdictSell, conf*0.7,
				fmt.Sprintf("regime=SIDEWAYS conf=%.2f — take profit on stretch", conf), citations)
		}
		return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.5,
			fmt.Sprintf("regime=SIDEWAYS conf=%.2f trigger=%s ambiguous", conf, triggerKind), citations)
	}

	return deliberation.AbstainBecause(Name,
		fmt.Sprintf("regime=%s conf=%.2f below decision thresholds", regime, conf))
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)

// Avoid unused-import warning when time is only used in citation struct.
var _ = time.Time{}
