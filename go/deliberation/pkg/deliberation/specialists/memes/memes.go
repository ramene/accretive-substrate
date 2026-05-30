// Package memes — Go port of @accretive-substrate/deliberation/specialists/memes.
//
// Filters venue in {kucoin, binance} + symbol base in memes set. Reads
// volume_velocity + kol_mentions_1h from MarketState.
package memes

import (
	"fmt"
	"math"
	"strings"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

const Name = "memes"

var memesSet = map[string]bool{
	"DOGE": true, "SHIB": true, "PEPE": true, "BONK": true, "WIF": true,
	"MEW": true, "BOME": true, "POPCAT": true, "PEPECOIN": true, "FLOKI": true,
	"BABYDOGE": true, "TRUMP": true, "BRETT": true, "TURBO": true, "PENGU": true,
}

type memeMarket struct {
	VolumeVelocity float64 `json:"volume_velocity"`
	KOLMentions1h  float64 `json:"kol_mentions_1h"`
}

func Argue(pkg deliberation.EvidencePackage) deliberation.Voice {
	venue := strings.ToLower(pkg.Trigger.Venue)
	if venue != "kucoin" && venue != "binance" {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("venue=%s out of scope", venue))
	}

	symbol := pkg.Trigger.Symbol
	base := strings.ToUpper(strings.Split(symbol, "-")[0])
	if !memesSet[base] {
		return deliberation.AbstainBecause(Name, fmt.Sprintf("symbol %s not in memes scope", symbol))
	}

	var market memeMarket
	_ = deliberation.DecodeMarketStateFor(pkg.MarketState, symbol, &market)

	citations := []deliberation.Citation{{
		Type:   "signal",
		Source: "memes",
		Symbol: symbol,
	}}

	if market.VolumeVelocity == 0 && market.KOLMentions1h == 0 {
		return deliberation.AbstainBecause(Name, "no velocity/chatter data")
	}

	// Parabolic — take profit before reversion.
	if market.VolumeVelocity > 5.0 {
		conf := math.Min(0.85, 0.65+(market.VolumeVelocity-5)/10)
		return deliberation.VoteFor(Name, deliberation.VerdictSell, conf,
			fmt.Sprintf("parabolic velocity %.1f× — take profit before reversion", market.VolumeVelocity),
			citations)
	}

	// Sharp velocity + chatter = entry.
	if market.VolumeVelocity > 3.0 && market.KOLMentions1h > 2 {
		conf := math.Min(0.85, 0.6+market.VolumeVelocity/15+market.KOLMentions1h/20)
		return deliberation.VoteFor(Name, deliberation.VerdictBuy, conf,
			fmt.Sprintf("velocity %.1f× + KOL chatter %.0f mentions/h",
				market.VolumeVelocity, market.KOLMentions1h),
			citations)
	}

	return deliberation.VoteFor(Name, deliberation.VerdictHold, 0.45,
		fmt.Sprintf("velocity %.1fx chatter %.0f", market.VolumeVelocity, market.KOLMentions1h),
		citations)
}

// Specialist — exported safe-wrapped argue function.
var Specialist = deliberation.MakeSafe(Name, Argue)
