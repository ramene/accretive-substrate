package cryptomajors

import (
	"encoding/json"
	"testing"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

func mkPkg(symbol, venue string, market map[string]any) deliberation.EvidencePackage {
	raw, _ := json.Marshal(market)
	return deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: deliberation.TriggerBuyProposal, Symbol: symbol, Venue: venue},
		MarketState: raw,
	}
}

func TestHealthyFundingTrendUpBuy(t *testing.T) {
	v := Argue(mkPkg("BTC-USDT", "kucoin", map[string]any{
		"funding_rate": 0.0008, "change_24h_pct": 2.4,
	}))
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestNegativeFundingSell(t *testing.T) {
	v := Argue(mkPkg("BTC-USDT", "binance", map[string]any{
		"funding_rate": -0.0005, "change_24h_pct": -1,
	}))
	if v.Verdict != deliberation.VerdictSell {
		t.Fatalf("expected sell, got %s", v.Verdict)
	}
}

func TestNonMajorAbstain(t *testing.T) {
	v := Argue(mkPkg("PEPE-USDT", "kucoin", map[string]any{
		"funding_rate": 0.001, "change_24h_pct": 5,
	}))
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}

func TestWrongVenueAbstain(t *testing.T) {
	v := Argue(mkPkg("BTC-USDT", "alpaca", map[string]any{}))
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}
