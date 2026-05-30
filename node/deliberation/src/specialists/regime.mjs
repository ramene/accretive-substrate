/**
 * @accretive-substrate/deliberation/specialists/regime
 *
 * Regime specialist. Reads regime_state + relevant regime-preset accretions
 * from the evidence package and emits a verdict based on regime + confidence.
 *
 * Verdict rules (deterministic — no brain calls):
 *   regime=CRASH conf >= 0.8    → hold       (don't add risk into a crash)
 *   regime=BEAR conf >= 0.7     → hold|sell  (sell if open; hold if proposing buy)
 *   regime=BULL conf >= 0.7     → buy        (favor adds + new entries)
 *   regime=SIDEWAYS conf >= 0.7 → mean-reversion bias (buy at lows, sell at highs)
 *                                If trigger doesn't specify direction → hold.
 *   regime=UNKNOWN OR conf<0.5  → abstain (insufficient signal)
 *
 * Cites: regime_state row + any regime-preset accretions in scope.
 *
 * Domain: 'all' — regime applies to every venue.
 */

import { makeSpecialist, voteFor, abstainBecause } from './base.mjs';

export const REGIME_SPECIALIST_NAME = 'regime';

async function argue(pkg) {
  const rs = pkg.regime_state;
  if (!rs || !rs.regime) {
    return abstainBecause(REGIME_SPECIALIST_NAME, 'no regime_state in evidence package');
  }
  const regime = String(rs.regime).toUpperCase();
  const conf = Number(rs.confidence) || 0;

  // Citations: the regime_state row + relevant regime-preset accretions.
  const citations = [
    { type: 'regime_state', regime, confidence: conf, ts: rs.ts || null },
  ];

  // Pull regime-preset accretions matching this regime (already filtered upstream
  // in assemble.mjs, but cite them here for traceability).
  const regimeAccretions = (pkg.accretions || []).filter(a =>
    a.canonical_path === `regime-preset:${regime.toLowerCase().replace(/_/g, '-')}`
  );
  for (const a of regimeAccretions) {
    citations.push({ type: 'accretion', id: a.id, canonical_path: a.canonical_path });
  }

  if (conf < 0.5) {
    return abstainBecause(REGIME_SPECIALIST_NAME, `regime conf ${conf.toFixed(2)} below 0.5 floor`);
  }

  const triggerKind = pkg?.trigger?.kind || 'unknown';

  // CRASH — always hold (don't add risk during freefall).
  if (regime === 'CRASH' && conf >= 0.8) {
    return voteFor(
      REGIME_SPECIALIST_NAME,
      'hold',
      conf,
      `regime=CRASH conf=${conf.toFixed(2)} — refuse new exposure`,
      citations,
    );
  }

  // BEAR — sell if reeval on open position; hold (block) if proposing buy.
  if (regime === 'BEAR' && conf >= 0.7) {
    if (triggerKind === 'sell_reeval') {
      return voteFor(
        REGIME_SPECIALIST_NAME, 'sell', conf,
        `regime=BEAR conf=${conf.toFixed(2)} — close on re-eval`, citations,
      );
    }
    return voteFor(
      REGIME_SPECIALIST_NAME, 'hold', Math.min(0.85, conf + 0.1),
      `regime=BEAR conf=${conf.toFixed(2)} — block new buys, no add`, citations,
    );
  }

  // BULL — favor buys.
  if (regime === 'BULL' && conf >= 0.7) {
    if (triggerKind === 'buy_proposal' || triggerKind === 'stack_add') {
      return voteFor(
        REGIME_SPECIALIST_NAME, 'buy', conf,
        `regime=BULL conf=${conf.toFixed(2)} — favor entry`, citations,
      );
    }
    return voteFor(
      REGIME_SPECIALIST_NAME, 'hold', conf * 0.8,
      `regime=BULL conf=${conf.toFixed(2)} but trigger=${triggerKind} not direction-aligned`, citations,
    );
  }

  // SIDEWAYS — mean-reversion bias. Without further per-symbol context here,
  // give a modest-confidence buy on buy_proposal (favor mean-reversion long entries)
  // and a modest-confidence sell on sell_reeval (take profit when stretched).
  if (regime === 'SIDEWAYS' && conf >= 0.7) {
    if (triggerKind === 'buy_proposal' || triggerKind === 'stack_add') {
      return voteFor(
        REGIME_SPECIALIST_NAME, 'buy', conf * 0.85,
        `regime=SIDEWAYS conf=${conf.toFixed(2)} — mean-reversion long bias`, citations,
      );
    }
    if (triggerKind === 'sell_reeval') {
      return voteFor(
        REGIME_SPECIALIST_NAME, 'sell', conf * 0.7,
        `regime=SIDEWAYS conf=${conf.toFixed(2)} — take profit on stretch`, citations,
      );
    }
    return voteFor(
      REGIME_SPECIALIST_NAME, 'hold', 0.5,
      `regime=SIDEWAYS conf=${conf.toFixed(2)} trigger=${triggerKind} ambiguous`, citations,
    );
  }

  // Below thresholds.
  return abstainBecause(
    REGIME_SPECIALIST_NAME,
    `regime=${regime} conf=${conf.toFixed(2)} below decision thresholds`,
  );
}

export const regimeSpecialist = makeSpecialist(REGIME_SPECIALIST_NAME, ['all'], argue);
