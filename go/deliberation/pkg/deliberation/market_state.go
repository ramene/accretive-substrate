// Market-state decode helper. Used by crypto-majors / equities / memes /
// defi / polymarket specialists to lift typed fields from the
// EvidencePackage.MarketState JSONB without each specialist re-implementing
// the symbol-keyed-vs-flat fallback.
//
// Mirrors Node `pkg?.market_state?.[symbol] || pkg?.market_state` — try
// the symbol-keyed sub-object first, fall back to the flat object.
package deliberation

import "encoding/json"

// DecodeMarketStateFor unmarshals MarketState into `out`. If MarketState
// is keyed by symbol (e.g. {"BTC-USDT": {...}}), the symbol-scoped object
// is preferred. Otherwise the top-level object is used.
//
// Returns nil on empty/missing MarketState — caller checks for the zero
// value of its target struct and abstains if all fields are zero.
func DecodeMarketStateFor(raw json.RawMessage, symbol string, out interface{}) error {
	if len(raw) == 0 {
		return nil
	}
	// Try symbol-keyed first.
	if symbol != "" {
		var byKey map[string]json.RawMessage
		if err := json.Unmarshal(raw, &byKey); err == nil {
			if symRaw, ok := byKey[symbol]; ok {
				return json.Unmarshal(symRaw, out)
			}
		}
	}
	// Fall back to flat.
	return json.Unmarshal(raw, out)
}
