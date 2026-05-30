package empiricalprior

import (
	"testing"

	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
)

func TestStrongBearSell(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:         deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		EmpiricalPriors: &deliberation.EmpiricalPriors{H24: &deliberation.EmpiricalHorizonRow{N: 12, WinRatePct: 22, MedianPct: -1.4}},
	})
	if v.Verdict != deliberation.VerdictSell {
		t.Fatalf("expected sell, got %s", v.Verdict)
	}
}

func TestStrongBullBuy(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:         deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		EmpiricalPriors: &deliberation.EmpiricalPriors{H24: &deliberation.EmpiricalHorizonRow{N: 18, WinRatePct: 78, MedianPct: 1.2}},
	})
	if v.Verdict != deliberation.VerdictBuy {
		t.Fatalf("expected buy, got %s", v.Verdict)
	}
}

func TestBelowSampleFloorAbstains(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{
		Trigger:         deliberation.Trigger{Kind: deliberation.TriggerBuyProposal},
		EmpiricalPriors: &deliberation.EmpiricalPriors{H24: &deliberation.EmpiricalHorizonRow{N: 3, WinRatePct: 20, MedianPct: -2}},
	})
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}

func TestNoPriorsAbstains(t *testing.T) {
	v := Argue(deliberation.EvidencePackage{Trigger: deliberation.Trigger{Kind: deliberation.TriggerBuyProposal}})
	if v.Verdict != deliberation.VerdictAbstain {
		t.Fatalf("expected abstain, got %s", v.Verdict)
	}
}
