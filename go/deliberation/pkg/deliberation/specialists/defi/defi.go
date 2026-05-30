// Package defi — Go port of @accretive-substrate/deliberation/specialists/defi.
//
// Filters venue in {aerodrome, uniswap}. Reads pool_apr_pct + tvl_usd +
// arb_spread_pct + impermanent_loss_pct.
package defi

import (
	"fmt"
	"math"
	"strings"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const Name = "defi"

type defiMarket struct {
	PoolAPRPct           float64 `json:"pool_apr_pct"`
	TVLUSD               float64 `json:"tvl_usd"`
	ArbSpreadPct         float64 `json:"arb_spread_pct"`
	ImpermanentLossPct   float64 `json:"impermanent_loss_pct"`
}

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	venue := strings.ToLower(pkg.Trigger.Venue)
	if venue != "aerodrome" && venue != "uniswap" {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("venue=%s out of scope", venue))
	}

	var market defiMarket
	_ = deliberation.DecodeMarketStateFor(pkg.MarketState, pkg.Trigger.Symbol, &market)

	citations := []deliberation.Citation{{
		Type:   "signal",
		Source: "defi",
	}}

	if market.PoolAPRPct == 0 && market.ArbSpreadPct == 0 {
		return deliberation.AbstainBecause(Name, "no pool/arb data")
	}

	// Open position with significant IL → sell.
	if pkg.Trigger.Kind == deliberation.TriggerSellReeval && market.ImpermanentLossPct > 8 {
		conf := math.Min(0.85, 0.6+market.ImpermanentLossPct/30)
		return deliberation.VoteFor(Name, deliberation.VerdictSell, conf,
			fmt.Sprintf("impermanent loss %.1f%% eating yield", market.ImpermanentLossPct),
			citations)
	}

	// High APR + TVL → buy.
	if market.PoolAPRPct > 50 && market.TVLUSD > 1_000_000 {
		conf := math.Min(0.82, 0.6+market.PoolAPRPct/300)
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
			fmt.Sprintf("pool APR %.0f%% + TVL $%.1fM", market.PoolAPRPct, market.TVLUSD/1e6),
			citations)
	}

	// Arb opportunity → buy.
	if market.ArbSpreadPct > 1.5 {
		conf := math.Min(0.80, 0.55+market.ArbSpreadPct/5)
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
			fmt.Sprintf("arb spread %.2f%% available", market.ArbSpreadPct),
			citations)
	}

	return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.45,
		fmt.Sprintf("APR %.0f%% arb %.2f%% — no edge", market.PoolAPRPct, market.ArbSpreadPct),
		citations)
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)
