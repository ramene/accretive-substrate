// Package cryptomajors — Go port of @accretive-substrate/deliberation/specialists/crypto-majors.
//
// Filters venue=kucoin|binance + symbol base in MAJORS list. Reads funding
// rate + 24h chg + (optional) orderbook depth from MarketState.
//
// Verdict rules (mirror Node):
//   funding>0.05% AND chg24>1%   → buy
//   funding<-0.03% OR chg24<-3%  → sell
//   else                          → hold
package cryptomajors

import (
	"fmt"
	"math"
	"strings"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const Name = "crypto-majors"

var majors = map[string]bool{
	"BTC": true, "ETH": true, "SOL": true, "BNB": true, "XRP": true,
	"ADA": true, "AVAX": true, "DOT": true, "LINK": true,
}

type majorsMarket struct {
	FundingRate       float64 `json:"funding_rate"`
	Change24hPct      float64 `json:"change_24h_pct"`
	OrderbookDepthUSD float64 `json:"orderbook_depth_usd"`
}

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	venue := strings.ToLower(pkg.Trigger.Venue)
	if venue != "kucoin" && venue != "binance" {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("venue=%s out of scope", venue))
	}

	symbol := pkg.Trigger.Symbol
	base := strings.ToUpper(strings.Split(symbol, "-")[0])
	if !majors[base] {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("symbol %s not a major", symbol))
	}

	var market majorsMarket
	_ = deliberation.DecodeMarketStateFor(pkg.MarketState, symbol, &market)

	citations := []deliberation.Citation{{
		Type:   "signal",
		Source: "crypto-majors",
		Symbol: symbol,
	}}

	// No data at all.
	if market.FundingRate == 0 && market.Change24hPct == 0 {
		return deliberation.AbstainBecause(Name, "no funding/24h data in evidence")
	}

	// Healthy basis + trend up → buy.
	if market.FundingRate > 0.0005 && market.Change24hPct > 1 {
		conf := math.Min(0.85, 0.6+market.Change24hPct/20+market.FundingRate*100)
		depth := ""
		if market.OrderbookDepthUSD > 0 {
			depth = fmt.Sprintf(" + depth $%.0f", market.OrderbookDepthUSD)
		}
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
			fmt.Sprintf("funding %.3f%% + 24h %.1f%%%s",
				market.FundingRate*100, market.Change24hPct, depth),
			citations)
	}

	// Bear basis or sharp dump → sell.
	if market.FundingRate < -0.0003 || market.Change24hPct < -3 {
		reason := fmt.Sprintf("24h drop %.1f%% > -3%% threshold", market.Change24hPct)
		if market.FundingRate < -0.0003 {
			reason = fmt.Sprintf("funding flipped negative %.3f%%", market.FundingRate*100)
		}
		conf := math.Min(0.85, 0.6+math.Abs(market.Change24hPct)/25)
		return deliberation.VoteFor(Name, deliberation.VerdictSell, conf, reason, citations)
	}

	return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.5,
		fmt.Sprintf("funding %.3f%% 24h %.1f%% — no clear edge",
			market.FundingRate*100, market.Change24hPct),
		citations)
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)
