package deliberation

import (
	"context"
	"errors"
	"testing"
)

func mkVoice(name string, v Verdict, c float64) Voice {
	var ab *string
	if v == VerdictAbstain {
		s := "x"
		ab = &s
	}
	return Voice{Specialist: name, Verdict: v, Confidence: c, Rationale: "", Citations: []Citation{}, AbstainedBecause: ab}
}

func TestAdjudicateAllAbstain(t *testing.T) {
	r := Adjudicate(context.Background(), []Voice{
		mkVoice("a", VerdictAbstain, 0),
		mkVoice("b", VerdictAbstain, 0),
	}, AdjudicateOptions{})
	if r.Verdict != VerdictHold {
		t.Fatalf("expected hold, got %s", r.Verdict)
	}
	if r.Confidence != 0 {
		t.Errorf("confidence expected 0, got %f", r.Confidence)
	}
}

func TestAdjudicateUnanimousBuy(t *testing.T) {
	r := Adjudicate(context.Background(), []Voice{
		mkVoice("regime", VerdictBuy, 0.8),
		mkVoice("aletheia", VerdictBuy, 0.7),
	}, AdjudicateOptions{})
	if r.Verdict != VerdictBuy {
		t.Fatalf("expected buy, got %s", r.Verdict)
	}
	if r.Confidence != 1 {
		t.Errorf("confidence expected 1, got %f", r.Confidence)
	}
	if r.DissentScore != 0 {
		t.Errorf("dissent expected 0, got %f", r.DissentScore)
	}
}

func TestAdjudicateDissentEscalates(t *testing.T) {
	brainCalled := false
	r := Adjudicate(context.Background(), []Voice{
		mkVoice("regime", VerdictBuy, 0.7),
		mkVoice("aletheia", VerdictSell, 0.6),
	}, AdjudicateOptions{
		Brain: func(ctx context.Context, prompt string) (string, error) {
			brainCalled = true
			return `{"verdict":"hold","confidence":0.5,"explanation":"split"}`, nil
		},
	})
	if !brainCalled {
		t.Fatal("expected brain to be called on dissent")
	}
	if !r.BrainEscalated {
		t.Error("expected BrainEscalated true")
	}
	if r.DissentScore < DefaultDissentThreshold {
		t.Errorf("dissent_score %f below threshold %f", r.DissentScore, DefaultDissentThreshold)
	}
}

func TestAdjudicateBrainFailureGraceful(t *testing.T) {
	r := Adjudicate(context.Background(), []Voice{
		mkVoice("a", VerdictBuy, 0.7),
		mkVoice("b", VerdictSell, 0.7),
	}, AdjudicateOptions{
		Brain: func(ctx context.Context, prompt string) (string, error) {
			return "", errors.New("cascade down")
		},
	})
	if !r.BrainEscalated {
		t.Error("expected BrainEscalated true even on failure")
	}
	if r.BrainSynthesis != nil {
		t.Error("expected nil BrainSynthesis on failure")
	}
	if r.Verdict != VerdictBuy {
		t.Errorf("expected weighted-majority buy, got %s", r.Verdict)
	}
}
