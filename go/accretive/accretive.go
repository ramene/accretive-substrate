// Package accretive — read-side accretive retrieval for the Go SELL path.
//
// Mirrors the @accretive-substrate/accretive Node package: queries the `accretions` table
// for a given canonical_path and returns compact citation strings suitable
// for embedding in shadow_trades.raw.memory_cite.
//
// Contract: never blocks a SELL. PG miss → empty slice, executor proceeds
// without accretive context. Per spec §4 Q4.
package accretive

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReadTimeout caps individual accretion lookups so an unresponsive PG never
// holds up the SELL hot path.
const ReadTimeout = 1500 * time.Millisecond

// PerSymbolPath returns the canonical_path for per-symbol accretions.
func PerSymbolPath(symbol string) string {
	if symbol == "" {
		return ""
	}
	return "per-symbol:" + symbol
}

// Row mirrors the @accretive-substrate/accretive shape — only the fields the SELL path
// embeds in the audit row.
type Row struct {
	ID              int64
	Operator        string
	AppendedAt      time.Time
	Fact            string
	ProvenanceClass string
}

// Citation renders a compact "accretion#42:operator@2026-05-29T18:08Z" token
// matching the Node citationOf() format.
func (r Row) Citation() string {
	if r.ID <= 0 {
		return ""
	}
	op := r.Operator
	if op == "" {
		op = "?"
	}
	ts := r.AppendedAt.UTC().Format("2006-01-02T15:04:05Z")
	return fmt.Sprintf("accretion#%d:%s@%s", r.ID, op, ts)
}

// Lookup returns the latest-N accretions for canonicalPath, newest first.
// confirmedOnly = true filters to operator-confirmed rows (default behavior).
//
// Returns empty slice + nil error on schema-missing or other expected-failure
// modes (table doesn't exist yet, query times out, etc.). Genuine query
// errors are returned for caller logging — but the caller should never
// halt SELL on the error.
func Lookup(ctx context.Context, pool *pgxpool.Pool, canonicalPath string, limit int) ([]Row, error) {
	if pool == nil || canonicalPath == "" {
		return nil, nil
	}
	if limit <= 0 || limit > 256 {
		limit = 8
	}

	queryCtx, cancel := context.WithTimeout(ctx, ReadTimeout)
	defer cancel()

	rows, err := pool.Query(queryCtx, `
		SELECT id, operator, appended_at, fact, provenance_class
		  FROM accretions
		 WHERE canonical_path = $1
		   AND operator_confirmed = TRUE
		 ORDER BY appended_at DESC
		 LIMIT $2`, canonicalPath, limit)
	if err != nil {
		// Likely cause: accretions table not yet present in this DB instance
		// (migration 0035 hasn't run). Return empty — caller proceeds without
		// accretive context.
		return nil, nil //nolint:nilerr
	}
	defer rows.Close()

	out := make([]Row, 0, limit)
	for rows.Next() {
		var r Row
		if scanErr := rows.Scan(&r.ID, &r.Operator, &r.AppendedAt, &r.Fact, &r.ProvenanceClass); scanErr != nil {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

// Citations is a convenience: fetch + render in one call. Returns empty slice
// when PG is unavailable or no rows match.
func Citations(ctx context.Context, pool *pgxpool.Pool, canonicalPath string, limit int) []string {
	rows, _ := Lookup(ctx, pool, canonicalPath, limit)
	if len(rows) == 0 {
		return nil
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		c := r.Citation()
		if c != "" {
			out = append(out, c)
		}
	}
	return out
}
