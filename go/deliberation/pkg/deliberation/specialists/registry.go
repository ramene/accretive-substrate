// Package specialists — registry of active specialists.
//
// B1.Go ships regime + aletheia (mirrors B1.Node). B2.Go will add the
// remaining 6 with cross-language fixture parity tests.
package specialists

import (
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/aletheia"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/cryptomajors"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/defi"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/empiricalprior"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/equities"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/memes"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/polymarket"
	"github.com/ramene/accretive-substrate/go/deliberation/pkg/deliberation/specialists/regime"
)

// ArgueFn re-exported for callers that want to write `specialists.ArgueFn`
// without importing the parent deliberation package directly.
type ArgueFn = deliberation.ArgueFn

// Active — the 8 specialists invoked by RunDeliberation by default.
// Order matches @accretive-substrate/deliberation/specialists/registry.mjs so the parity
// reporter can compare voice arrays index-for-index in B6.
var Active = []ArgueFn{
	regime.Specialist,
	aletheia.Specialist,
	empiricalprior.Specialist,
	cryptomajors.Specialist,
	equities.Specialist,
	memes.Specialist,
	defi.Specialist,
	polymarket.Specialist,
}

// Names — names of all active specialists in registry order.
var Names = []string{
	regime.Name,
	aletheia.Name,
	empiricalprior.Name,
	cryptomajors.Name,
	equities.Name,
	memes.Name,
	defi.Name,
	polymarket.Name,
}
