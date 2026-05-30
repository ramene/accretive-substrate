package memes

import (
	"encoding/json"
	"testing"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

func mkPkg(symbol, venue string, kind deliberation.TriggerKind, market map[string]any) deliberation.EvidencePackage {
	raw, _ := json.Marshal(market)
	return deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: kind, Symbol: symbol, Venue: venue},
		MarketState: raw,
	}
}

func TestVelocityChatterBuy(t *testing.T) {
	v := Argue(mkPkg("PEPE-USDT", "kucoin", deliberation.TriggerBuyProposal, map[string]any{
		"volume_velocity": 4.2, "kol_mentions_1h": 6,
	}))
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestParabolicSell(t *testing.T) {
	v := Argue(mkPkg("PEPE-USDT", "kucoin", deliberation.TriggerSellReeval, map[string]any{
		"volume_velocity": 7.5, "kol_mentions_1h": 4,
	}))
	if v.Verdict != deliberation.VerdictSell {
		t.Fatalf("expected sell, got %s", v.Verdict)
	}
}

func TestNonMemeAbstain(t *testing.T) {
	v := Argue(mkPkg("BTC-USDT", "kucoin", deliberation.TriggerBuyProposal, map[string]any{
		"volume_velocity": 8, "kol_mentions_1h": 5,
	}))
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}
