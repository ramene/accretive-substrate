package polymarket

import (
	"encoding/json"
	"testing"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

func mkPkg(venue string, kind deliberation.TriggerKind, market map[string]any) deliberation.EvidencePackage {
	raw, _ := json.Marshal(market)
	return deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: kind, Venue: venue},
		MarketState: raw,
	}
}

func TestStrongShiftAndVolumeBuy(t *testing.T) {
	v := Argue(mkPkg("polymarket", deliberation.TriggerBuyProposal, map[string]any{
		"odds_shift_24h_pp": 8.4, "volume_24h_usd": 250_000.0, "time_to_resolution_days": 7.0,
	}))
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestNegativeShiftSell(t *testing.T) {
	v := Argue(mkPkg("polymarket", deliberation.TriggerSellReeval, map[string]any{
		"odds_shift_24h_pp": -8.2, "volume_24h_usd": 150_000.0,
	}))
	if v.Verdict != deliberation.VerdictSell {
		t.Fatalf("expected sell, got %s", v.Verdict)
	}
}

func TestNearResolutionRiskOff(t *testing.T) {
	v := Argue(mkPkg("polymarket", deliberation.TriggerSellReeval, map[string]any{
		"odds_shift_24h_pp": 1.0, "volume_24h_usd": 100_000.0,
		"time_to_resolution_days": 0.4, "odds_volatility_pct": 28.0,
	}))
	if v.Verdict != deliberation.VerdictSell {
		t.Fatalf("expected sell, got %s", v.Verdict)
	}
}

func TestWrongVenueAbstain(t *testing.T) {
	v := Argue(mkPkg("kucoin", deliberation.TriggerBuyProposal, map[string]any{
		"odds_shift_24h_pp": 10.0,
	}))
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}
