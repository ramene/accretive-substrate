package aletheia

import (
	"testing"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

func TestNoSignalsAbstain(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:       deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		AletheiaState: &deliberation.AletheiaState{Weights: deliberation.AletheiaWeights{Sources: map[string]float64{"kucoin-scanner": 0.6}}},
	})
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}

func TestMaxWeightBelowFloorAbstains(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger: deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		Signals: []deliberation.Signal{{Source: "kucoin-scanner", Direction: "bullish", Confidence: 0.7}},
		AletheiaState: &deliberation.AletheiaState{Weights: deliberation.AletheiaWeights{Sources: map[string]float64{"kucoin-scanner": 0.4}}},
	})
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}

func TestBullishMajorityBuy(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger: deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		Signals: []deliberation.Signal{
			{Source: "kucoin-scanner", Direction: "bullish", Confidence: 0.7},
			{Source: "finnhub-news", Direction: "bullish", Confidence: 0.65},
			{Source: "finviz", Direction: "bearish", Confidence: 0.5},
		},
		AletheiaState: &deliberation.AletheiaState{Weights: deliberation.AletheiaWeights{
			Sources: map[string]float64{"kucoin-scanner": 0.6, "finnhub-news": 0.55, "finviz": 0.5},
		}},
	})
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestMixedSignalsHold(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger: deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		Signals: []deliberation.Signal{
			{Source: "a", Direction: "bullish", Confidence: 0.6},
			{Source: "b", Direction: "bearish", Confidence: 0.6},
		},
		AletheiaState: &deliberation.AletheiaState{Weights: deliberation.AletheiaWeights{
			Sources: map[string]float64{"a": 0.5, "b": 0.5},
		}},
	})
	if v.Verdict != deliberation.VerdictHold {
		t.Fatalf("expected hold, got %s", v.Verdict)
	}
}
