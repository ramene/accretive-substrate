package equities

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

func TestStrongSectorRSBuy(t *testing.T) {
	v := Argue(mkPkg("NVDA", "alpaca", map[string]any{
		"sector_strength": 0.8, "symbol_rs": 1.2, "drawdown_pct": 0,
	}))
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestClosedMarketAbstain(t *testing.T) {
	v := Argue(mkPkg("NVDA", "alpaca", map[string]any{"session": "closed"}))
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}

func TestDrawdownSell(t *testing.T) {
	pkg := mkPkg("NVDA", "alpaca", map[string]any{
		"sector_strength": 0.5, "symbol_rs": 0.9, "drawdown_pct": 8,
	})
	pkg.Trigger.Kind = deliberation.TriggerSellReeval
	v := Argue(pkg)
	if v.Verdict != deliberation.VerdictSell {
		t.Fatalf("expected sell, got %s", v.Verdict)
	}
}
