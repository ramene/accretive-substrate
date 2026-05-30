// Package polymarket — Go port of @accretive-substrate/deliberation/specialists/polymarket.
//
// Filters venue=polymarket. Reads odds_shift_24h_pp + volume_24h_usd +
// time_to_resolution_days + odds_volatility_pct.
package polymarket

import (
	"fmt"
	"math"
	"strings"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const Name = "polymarket"

type polyMarket struct {
	OddsShift24hPP       float64 `json:"odds_shift_24h_pp"`
	Volume24hUSD         float64 `json:"volume_24h_usd"`
	TimeToResolutionDays float64 `json:"time_to_resolution_days"`
	OddsVolatilityPct    float64 `json:"odds_volatility_pct"`
}

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	venue := strings.ToLower(pkg.Trigger.Venue)
	if venue != "polymarket" {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("venue=%s out of scope", venue))
	}

	var market polyMarket
	_ = deliberation.DecodeMarketStateFor(pkg.MarketState, pkg.Trigger.Symbol, &market)

	citations := []deliberation.Citation{{
		Type:   "signal",
		Source: "polymarket",
	}}

	if market.OddsShift24hPP == 0 {
		return deliberation.AbstainBecause(Name, "no odds shift data")
	}

	// Near resolution + high volatility — risk off.
	if market.TimeToResolutionDays > 0 && market.TimeToResolutionDays < 1 && market.OddsVolatilityPct > 20 {
		conf := math.Min(0.82, 0.6+market.OddsVolatilityPct/100)
		return deliberation.VoteFor(Name, deliberation.VerdictSell, conf,
			fmt.Sprintf("resolution in %.1fh + odds volatility %.0f%% — risk off",
				market.TimeToResolutionDays*24, market.OddsVolatilityPct),
			citations)
	}

	// Strong momentum + liquidity → buy.
	if market.OddsShift24hPP > 5 && market.Volume24hUSD > 100_000 {
		conf := math.Min(0.82, 0.55+market.OddsShift24hPP/30)
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
			fmt.Sprintf("odds shifted +%.1fpp on $%dk 24h volume",
				market.OddsShift24hPP, int(market.Volume24hUSD/1000)),
			citations)
	}

	// Event drifting away → sell.
	if market.OddsShift24hPP < -5 {
		conf := math.Min(0.82, 0.55+math.Abs(market.OddsShift24hPP)/30)
		return deliberation.VoteFor(Name, deliberation.VerdictSell, conf,
			fmt.Sprintf("odds shifted %.1fpp — event drifting away", market.OddsShift24hPP),
			citations)
	}

	volLabel := "n/a"
	if market.Volume24hUSD > 0 {
		volLabel = fmt.Sprintf("$%dk", int(market.Volume24hUSD/1000))
	}
	return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.45,
		fmt.Sprintf("shift %.1fpp volume %s — no decisive move", market.OddsShift24hPP, volLabel),
		citations)
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)
