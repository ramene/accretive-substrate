// Package equities — Go port of @accretive-substrate/deliberation/specialists/equities.
//
// Filters venue=alpaca. Reads sector_strength + symbol_rs + drawdown_pct
// + session from MarketState.
package equities

import (
	"fmt"
	"math"
	"strings"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const Name = "equities"

type equityMarket struct {
	Session         string  `json:"session"`
	SectorStrength  float64 `json:"sector_strength"`
	SymbolRS        float64 `json:"symbol_rs"`
	DrawdownPct     float64 `json:"drawdown_pct"`
}

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	venue := strings.ToLower(pkg.Trigger.Venue)
	if venue != "alpaca" {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("venue=%s out of scope", venue))
	}

	var market equityMarket
	_ = deliberation.DecodeMarketStateFor(pkg.MarketState, pkg.Trigger.Symbol, &market)

	if market.Session == "closed" {
		return deliberation.AbstainBecause(Name, "equity market closed — no decision")
	}

	citations := []deliberation.Citation{{
		Type:   "signal",
		Source: "equities",
	}}

	if market.SectorStrength == 0 && market.SymbolRS == 0 {
		return deliberation.AbstainBecause(Name, "no sector/RS data in evidence")
	}

	if market.SectorStrength > 0.7 && market.SymbolRS > 1.0 {
		conf := math.Min(0.85, 0.6+market.SectorStrength*0.2)
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
			fmt.Sprintf("sector strong %.2f + RS %.2f", market.SectorStrength, market.SymbolRS),
			citations)
	}

	if market.SectorStrength < 0.3 || market.DrawdownPct > 5 {
		bump := 0.1
		if market.DrawdownPct > 5 {
			bump = market.DrawdownPct / 20
		}
		conf := math.Min(0.85, 0.6+bump)
		return deliberation.VoteFor(Name, deliberation.VerdictSell, conf,
			fmt.Sprintf("sector weak %.2f or drawdown %.1f%%", market.SectorStrength, market.DrawdownPct),
			citations)
	}

	rsLabel := "n/a"
	if market.SymbolRS != 0 {
		rsLabel = fmt.Sprintf("%.2f", market.SymbolRS)
	}
	return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.5,
		fmt.Sprintf("sector %.2f RS %s — neutral", market.SectorStrength, rsLabel),
		citations)
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)
