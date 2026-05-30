// Package deliberation — types matching the Node @accretive-substrate/deliberation shape
// byte-identically.
//
// Cross-language parity is non-negotiable: the parity reporter (mae-parity-
// reporter) compares deliberations rows from SHADOW (Go writer, this package)
// vs LIVE (Node writer, @accretive-substrate/deliberation). Field name divergence anywhere
// in this file breaks the parity gate.
//
// JSON tags must match the Node JSON output exactly. Any change here
// requires matching change to packages/deliberation/src/schema.mjs.
package deliberation

import (
	"encoding/json"
	"time"
)

// Verdict — one of {buy, sell, hold, abstain}.
type Verdict string

const (
	VerdictBuy     Verdict = "buy"
	VerdictSell    Verdict = "sell"
	VerdictHold    Verdict = "hold"
	VerdictAbstain Verdict = "abstain"
)

// FinalVerdict — Stage 5 output enum.
type FinalVerdict string

const (
	FinalExecute          FinalVerdict = "execute"
	FinalAbort            FinalVerdict = "abort"
	FinalOperatorRequired FinalVerdict = "operator_required"
	FinalHold             FinalVerdict = "hold"
)

// SourcePipeline — Path B dual-mode discriminator.
type SourcePipeline string

const (
	PipelineNode SourcePipeline = "node"
	PipelineGo SourcePipeline = "go"
)

// TriggerKind — enum of why a deliberation was initiated.
type TriggerKind string

const (
	TriggerBuyProposal             TriggerKind = "buy_proposal"
	TriggerSellReeval              TriggerKind = "sell_reeval"
	TriggerStackAdd                TriggerKind = "stack_add"
	TriggerDivergenceInvestigation TriggerKind = "divergence_investigation"
	TriggerRegimeTransition        TriggerKind = "regime_transition"
	TriggerGateStack               TriggerKind = "gate_stack"
	TriggerOperatorRequest         TriggerKind = "operator_request"
)

// Trigger — what kicked off this deliberation.
type Trigger struct {
	Kind    TriggerKind     `json:"kind"`
	Symbol  string          `json:"symbol,omitempty"`
	Venue   string          `json:"venue,omitempty"`
	AgentID int             `json:"agent_id,omitempty"`
	TS      *time.Time      `json:"ts,omitempty"`
	Raw     json.RawMessage `json:"raw,omitempty"`
}

// Signal — one upstream source's read at trigger time.
type Signal struct {
	Source     string          `json:"source"`
	Direction  string          `json:"direction"` // bullish | bearish | neutral
	Confidence float64         `json:"confidence"`
	TS         *time.Time      `json:"ts,omitempty"`
	Raw        json.RawMessage `json:"raw,omitempty"`
}

// Accretion — slim shape used INSIDE the evidence package. Full shape
// (with all 11 fields) lives in pkg/accretive or via the @accretive-substrate/accretive
// Node lib — we only carry what the specialists need to cite.
type Accretion struct {
	ID                int64           `json:"id"`
	CanonicalPath     string          `json:"canonical_path"`
	Operator          string          `json:"operator,omitempty"`
	OperatorConfirmed bool            `json:"operator_confirmed"`
	ProvenanceClass   string          `json:"provenance_class,omitempty"`
	Fact              string          `json:"fact"`
	AppendedAt        *time.Time      `json:"appended_at,omitempty"`
	Raw               json.RawMessage `json:"raw,omitempty"`
}

// PriorTrade — a recent matching setup, fed to specialists for citation.
type PriorTrade struct {
	ID         int64           `json:"id"`
	Symbol     string          `json:"symbol"`
	Side       string          `json:"side"`
	OutcomePnL float64         `json:"outcome_pnl,omitempty"`
	Raw        json.RawMessage `json:"raw,omitempty"`
}

// RegimeState — the regime detector's current view.
type RegimeState struct {
	Regime     string     `json:"regime"`
	Confidence float64    `json:"confidence"`
	TS         *time.Time `json:"ts,omitempty"`
}

// GateState — gate registry view at trigger time.
type GateState struct {
	Active   []string `json:"active"`
	Blocking []string `json:"blocking"`
}

// AletheiaState — per-source learned weights.
type AletheiaState struct {
	Weights AletheiaWeights `json:"weights"`
}
type AletheiaWeights struct {
	Sources map[string]float64 `json:"sources"`
}

// EmpiricalPriors — 24h forward-return distributions for the signal pattern.
type EmpiricalPriors struct {
	Pattern string                `json:"pattern,omitempty"`
	H24     *EmpiricalHorizonRow  `json:"h24,omitempty"`
}
type EmpiricalHorizonRow struct {
	N           int     `json:"n"`
	WinRatePct  float64 `json:"win_rate_pct"`
	MedianPct   float64 `json:"median_pct"`
}

// ProposedPosition — the trade the deliberation is evaluating.
type ProposedPosition struct {
	Symbol                    string  `json:"symbol,omitempty"`
	Qty                       float64 `json:"qty,omitempty"`
	EstimatedDollar           float64 `json:"estimated_dollar"`
	AgentPositionDollarFloor  float64 `json:"agent_position_dollar_floor"`
	AgentMaxPositionDollar    float64 `json:"agent_max_position_dollar,omitempty"`
}

// EvidencePackage — Stage 1 output. The information all specialists see.
type EvidencePackage struct {
	Trigger             Trigger          `json:"trigger"`
	Signals             []Signal         `json:"signals,omitempty"`
	Accretions          []Accretion      `json:"accretions,omitempty"`
	PriorTrades         []PriorTrade     `json:"prior_trades,omitempty"`
	GateState           GateState        `json:"gate_state"`
	RegimeState         *RegimeState     `json:"regime_state,omitempty"`
	FNG                 json.RawMessage  `json:"fng,omitempty"`
	BrainCascadeHealth  json.RawMessage  `json:"brain_cascade_health,omitempty"`
	EmpiricalPriors     *EmpiricalPriors `json:"empirical_priors,omitempty"`
	AletheiaState       *AletheiaState   `json:"aletheia_state,omitempty"`
	MarketState         json.RawMessage  `json:"market_state,omitempty"`
	ProposedPosition    *ProposedPosition `json:"proposed_position,omitempty"`
}

// Citation — an evidence row that a voice argues from.
type Citation struct {
	Type           string  `json:"type"`
	ID             int64   `json:"id,omitempty"`
	CanonicalPath  string  `json:"canonical_path,omitempty"`
	Source         string  `json:"source,omitempty"`
	Symbol         string  `json:"symbol,omitempty"`
	Direction      string  `json:"direction,omitempty"`
	Confidence     float64 `json:"confidence,omitempty"`
	Regime         string  `json:"regime,omitempty"`
	TS             *time.Time `json:"ts,omitempty"`
	Horizon        string  `json:"horizon,omitempty"`
	N              int     `json:"n,omitempty"`
	WR             float64 `json:"wr,omitempty"`
	Median         float64 `json:"median,omitempty"`
	Pattern        string  `json:"pattern,omitempty"`
	SourceCount    int     `json:"source_count,omitempty"`
	Extra          json.RawMessage `json:"extra,omitempty"`
}

// Voice — one specialist's argument.
//
// JSON shape MUST match @accretive-substrate/deliberation Node side byte-identically.
type Voice struct {
	Specialist        string     `json:"specialist"`
	Verdict           Verdict    `json:"verdict"`
	Confidence        float64    `json:"confidence"`
	Rationale         string     `json:"rationale"`
	Citations         []Citation `json:"citations"`
	AbstainedBecause  *string    `json:"abstained_because"`
}

// WeightDistribution — Stage 3 input.
type WeightDistribution struct {
	Buy  float64 `json:"buy"`
	Sell float64 `json:"sell"`
	Hold float64 `json:"hold"`
}

// Adjudication — Stage 3 output.
type Adjudication struct {
	Verdict            Verdict            `json:"verdict"`
	Confidence         float64            `json:"confidence"`
	DissentScore       float64            `json:"dissent_score"`
	WeightDistribution WeightDistribution `json:"weight_distribution"`
	BrainEscalated     bool               `json:"brain_escalated"`
	BrainSynthesis     *string            `json:"brain_synthesis"`
	DissentLog         []string           `json:"dissent_log"`
	NActiveVoices      int                `json:"n_active_voices"`
	NTotalVoices       int                `json:"n_total_voices"`
}

// SoftConflict — an unconfirmed accretion arguing against the adjudicated verdict.
type SoftConflict struct {
	AccretionID   int64  `json:"accretion_id"`
	CanonicalPath string `json:"canonical_path,omitempty"`
	Fact          string `json:"fact,omitempty"`
}

// GuardrailResult — Stage 4 output.
type GuardrailResult struct {
	Passed            bool           `json:"passed"`
	HardBlocks        []string       `json:"hard_blocks"`
	SoftConflicts     []SoftConflict `json:"soft_conflicts"`
	ExposureThreshold float64        `json:"exposure_threshold"`
	ProposedDollar    float64        `json:"proposed_dollar"`
	PolicyApplied     string         `json:"policy_applied"` // pause | flag | no_conflicts
}

// DeliberationRow — what gets persisted in deliberations table.
type DeliberationRow struct {
	ID              int64          `json:"id,omitempty"`
	TS              *time.Time     `json:"ts,omitempty"`
	SourcePipeline  SourcePipeline `json:"source_pipeline"`
	TriggerKind     TriggerKind    `json:"trigger_kind"`
	Symbol          string         `json:"symbol,omitempty"`
	Venue           string         `json:"venue,omitempty"`
	AgentID         int            `json:"agent_id,omitempty"`
	EvidencePackage EvidencePackage `json:"evidence_package"`
	Voices          []Voice        `json:"voices"`
	Adjudication    Adjudication   `json:"adjudication"`
	GuardrailResult GuardrailResult `json:"guardrail_result"`
	FinalVerdict    FinalVerdict   `json:"final_verdict"`
	TradeRef        *int64         `json:"trade_ref,omitempty"`
	TradeRefTable   string         `json:"trade_ref_table,omitempty"`
	LibraryVersion  string         `json:"library_version,omitempty"`
	SchemaVersion   string         `json:"schema_version,omitempty"`
}

// RunResult — what RunDeliberation returns to the caller.
type RunResult struct {
	DeliberationID *int64          `json:"deliberation_id"`
	FinalVerdict   FinalVerdict    `json:"final_verdict"`
	Adjudication   Adjudication    `json:"adjudication"`
	Guardrail      GuardrailResult `json:"guardrail"`
	Voices         []Voice         `json:"voices"`
	Persisted      bool            `json:"persisted"`
	PersistError   string          `json:"persist_error,omitempty"`
	Error          string          `json:"error,omitempty"`
}

// ArgueFn — specialist function signature. Defined here in the parent
// package so the orchestrator can talk about specialists without importing
// the specialists subpackage (which would create a cycle: specialists
// already needs pkg/deliberation for Voice/EvidencePackage types).
type ArgueFn func(pkg EvidencePackage) Voice
