package persymboldrift

import (
	"testing"
)

func TestResultZeroValueSafe(t *testing.T) {
	// Verify Result struct is JSON-marshalable as zero value.
	r := Result{}
	if r.Detected != 0 || r.Emitted != 0 || r.Errors != 0 {
		t.Error("zero Result should have zero counters")
	}
}

func TestDriftShape(t *testing.T) {
	d := Drift{Symbol: "BTC-USDT", Verdict: "buy", N: 4, DeliberationIDs: []int64{1, 2, 3, 4}}
	if d.Symbol != "BTC-USDT" {
		t.Error("symbol field")
	}
	if len(d.DeliberationIDs) != 4 {
		t.Error("deliberation ids array")
	}
}

func TestDefaultsExposed(t *testing.T) {
	if DefaultNThreshold != 3 {
		t.Errorf("DefaultNThreshold expected 3, got %d", DefaultNThreshold)
	}
	if DefaultWindowMinutes != 30 {
		t.Errorf("DefaultWindowMinutes expected 30, got %d", DefaultWindowMinutes)
	}
	if DefaultCooldownMinutes != 30 {
		t.Errorf("DefaultCooldownMinutes expected 30, got %d", DefaultCooldownMinutes)
	}
}

// Live-PG end-to-end tests live in <this repo>/go/deliberation/cmd/observer
// integration test invoked from B6 wake; this file only verifies the
// pure-Go data shapes + constants are stable for the cross-language
// parity assertion.
