package accretive

import (
	"strings"
	"testing"
	"time"
)

func TestPerSymbolPath(t *testing.T) {
	got := PerSymbolPath("BTC-USDT")
	want := "per-symbol:BTC-USDT"
	if got != want {
		t.Errorf("PerSymbolPath: got %q want %q", got, want)
	}
	if PerSymbolPath("") != "" {
		t.Error("PerSymbolPath empty input should return empty")
	}
}

func TestCitation(t *testing.T) {
	ts := time.Date(2026, 5, 29, 18, 8, 0, 0, time.UTC)
	r := Row{ID: 42, Operator: "ramene", AppendedAt: ts}
	got := r.Citation()
	want := "accretion#42:ramene@2026-05-29T18:08:00Z"
	if got != want {
		t.Errorf("Citation: got %q want %q", got, want)
	}
}

func TestCitationEmpty(t *testing.T) {
	r := Row{}
	if r.Citation() != "" {
		t.Error("Citation on zero row should be empty")
	}
}

func TestCitationDefaultsOperator(t *testing.T) {
	ts := time.Date(2026, 5, 29, 18, 8, 0, 0, time.UTC)
	r := Row{ID: 7, AppendedAt: ts}
	got := r.Citation()
	if !strings.Contains(got, ":?@") {
		t.Errorf("Citation missing-operator should default to ?: got %q", got)
	}
}
