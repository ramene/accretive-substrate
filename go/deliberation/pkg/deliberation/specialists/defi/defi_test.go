package defi

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

func TestHighAPRTVLBuy(t *testing.T) {
	v := Argue(mkPkg("aerodrome", deliberation.TriggerBuyProposal, map[string]any{
		"pool_apr_pct": 80.0, "tvl_usd": 5_000_000.0,
	}))
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestArbSpreadBuy(t *testing.T) {
	v := Argue(mkPkg("aerodrome", deliberation.TriggerBuyProposal, map[string]any{
		"pool_apr_pct": 30.0, "arb_spread_pct": 2.1,
	}))
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestILOnSellReevalSell(t *testing.T) {
	v := Argue(mkPkg("aerodrome", deliberation.TriggerSellReeval, map[string]any{
		"pool_apr_pct": 40.0, "impermanent_loss_pct": 12.0,
	}))
	if v.Verdict != deliberation.VerdictSell {
		t.Fatalf("expected sell, got %s", v.Verdict)
	}
}

func TestWrongVenueAbstain(t *testing.T) {
	v := Argue(mkPkg("kucoin", deliberation.TriggerBuyProposal, map[string]any{
		"pool_apr_pct": 80.0,
	}))
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}
