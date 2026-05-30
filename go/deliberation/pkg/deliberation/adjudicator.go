// Adjudicator — Stage 3. Hybrid weighted-majority + brain-on-dissent.
//
// Operator-mandated §10.3: weighted by default, escalate to brain when
// dissent_score ≥ 0.30 (DefaultDissentThreshold).
package deliberation

import (
	"context"
	"fmt"
)

const DefaultDissentThreshold = 0.30

// BrainFn — optional brain synthesis function. Caller injects via
// AdjudicateOptions. Library never depends on a specific brain client.
type BrainFn func(ctx context.Context, prompt string) (string, error)

// AdjudicateOptions — tuning for Adjudicate().
type AdjudicateOptions struct {
	Brain             BrainFn
	DissentThreshold  float64
}

// Adjudicate applies the hybrid policy and produces an Adjudication.
//
// Mirrors Node @accretive-substrate/deliberation/adjudicator.mjs. Verdict + confidence +
// dissent_score must be byte-identical given identical voice slices.
func Adjudicate(ctx context.Context, voices []Voice, opts AdjudicateOptions) Adjudication {
	threshold := opts.DissentThreshold
	if threshold <= 0 {
		threshold = DefaultDissentThreshold
	}

	active := make([]Voice, 0, len(voices))
	for _, v := range voices {
		if v.Verdict != VerdictAbstain {
			active = append(active, v)
		}
	}

	dist := WeightDistribution{}
	for _, v := range active {
		switch v.Verdict {
		case VerdictBuy:
			dist.Buy += v.Confidence
		case VerdictSell:
			dist.Sell += v.Confidence
		case VerdictHold:
			dist.Hold += v.Confidence
		}
	}
	totalWeight := dist.Buy + dist.Sell + dist.Hold

	if totalWeight == 0 {
		return Adjudication{
			Verdict:            VerdictHold,
			Confidence:         0,
			DissentScore:       0,
			WeightDistribution: dist,
			BrainEscalated:     false,
			BrainSynthesis:     nil,
			DissentLog:         []string{},
			NActiveVoices:      len(active),
			NTotalVoices:       len(voices),
		}
	}

	leader := VerdictHold
	leaderWeight := dist.Hold
	if dist.Buy > leaderWeight {
		leader = VerdictBuy
		leaderWeight = dist.Buy
	}
	if dist.Sell > leaderWeight {
		leader = VerdictSell
		leaderWeight = dist.Sell
	}

	var dissentWeight float64
	switch leader {
	case VerdictBuy:
		dissentWeight = dist.Sell
	case VerdictSell:
		dissentWeight = dist.Buy
	case VerdictHold:
		dissentWeight = dist.Buy + dist.Sell
	}

	dissentScore := dissentWeight / max(totalWeight, 1e-9)
	leaderShare := leaderWeight / max(totalWeight, 1e-9)

	dissentLog := []string{}
	for _, v := range active {
		if v.Verdict != leader && v.Verdict != VerdictHold {
			dissentLog = append(dissentLog, fmt.Sprintf("%s@%.2f:%s", v.Specialist, v.Confidence, v.Verdict))
		}
	}

	brainEscalated := false
	var brainSynthesis *string
	if dissentScore >= threshold && opts.Brain != nil {
		brainEscalated = true
		prompt := buildBrainPrompt(voices, dist, string(leader), leaderShare, dissentScore)
		if s, err := opts.Brain(ctx, prompt); err == nil && s != "" {
			brainSynthesis = &s
		}
		// Brain failure non-fatal — we still return weighted-majority verdict.
	}

	return Adjudication{
		Verdict:            leader,
		Confidence:         leaderShare,
		DissentScore:       dissentScore,
		WeightDistribution: dist,
		BrainEscalated:     brainEscalated,
		BrainSynthesis:     brainSynthesis,
		DissentLog:         dissentLog,
		NActiveVoices:      len(active),
		NTotalVoices:       len(voices),
	}
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func buildBrainPrompt(voices []Voice, dist WeightDistribution, leader string, leaderShare, dissent float64) string {
	var lines string
	for _, v := range voices {
		lines += fmt.Sprintf("  - %s (%s, conf=%.2f): %s\n", v.Specialist, v.Verdict, v.Confidence, v.Rationale)
	}
	return fmt.Sprintf(`You are adjudicating a multi-specialist trading deliberation where the voices disagree.

VOICES:
%s
WEIGHTED DISTRIBUTION: buy=%.2f sell=%.2f hold=%.2f
LEADER: %s (share=%.2f)
DISSENT SCORE: %.2f

The leader-verdict majority is contested. Choose the final verdict (buy/sell/hold) considering:
1. Which dissenting voices have the strongest evidence?
2. Is the dissent of a kind that should override the majority, or noise that should be weighted down?

Respond ONLY in JSON: {"verdict":"buy|sell|hold","confidence":0..1,"explanation":"..."}`,
		lines, dist.Buy, dist.Sell, dist.Hold, leader, leaderShare, dissent)
}
