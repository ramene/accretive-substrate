package regime

import (
	"testing"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

func TestCrashHigh(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: deliberation.TriggerBuyProposal, Symbol: "BTC-USDT", Venue: "kucoin"},
		RegimeState: &deliberation.RegimeState{Regime: "CRASH", Confidence: 0.85},
	})
	if v.Verdict != deliberation.VerdictHold {
		t.Fatalf("CRASH high conf expected hold, got %s", v.Verdict)
	}
	if v.Confidence < 0.7 {
		t.Errorf("conf %f too low", v.Confidence)
	}
}

func TestBullBuy(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: deliberation.TriggerBuyProposal, Symbol: "BTC-USDT", Venue: "kucoin"},
		RegimeState: &deliberation.RegimeState{Regime: "BULL", Confidence: 0.8},
	})
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("BULL buy_proposal expected buy, got %s", v.Verdict)
	}
}

func TestSidewaysMeanReversionBuy(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: deliberation.TriggerBuyProposal, Symbol: "BTC-USDT", Venue: "kucoin"},
		RegimeState: &deliberation.RegimeState{Regime: "SIDEWAYS", Confidence: 0.82},
	})
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("SIDEWAYS buy_proposal expected buy, got %s", v.Verdict)
	}
	if v.Confidence >= 0.82 {
		t.Errorf("expected discount from raw conf, got %f", v.Confidence)
	}
}

func TestLowConfAbstain(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		RegimeState: &deliberation.RegimeState{Regime: "SIDEWAYS", Confidence: 0.3},
	})
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("low conf expected abstain, got %s", v.Verdict)
	}
}

func TestMissingRegimeAbstain(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger: deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
	})
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("missing regime expected abstain, got %s", v.Verdict)
	}
}

func TestCitesAccretions(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:     deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		RegimeState: &deliberation.RegimeState{Regime: "SIDEWAYS", Confidence: 0.82},
		Accretions: []deliberation.Accretion{
			{ID: 42, CanonicalPath: "regime-preset:sideways"},
			{ID: 99, CanonicalPath: "per-symbol:BTC-USDT"},
		},
	})
	found := false
	for _, c := range v.Citations {
		if c.Type == "accretion" && c.ID == 42 {
			found = true
		}
	}
	if !found {
		t.Error("expected to cite accretion 42")
	}
}
