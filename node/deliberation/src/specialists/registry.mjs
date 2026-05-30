/**
 * @accretive-substrate/deliberation/specialists/registry
 *
 * Active specialists registry.
 *
 * B2.Node (this commit) ships all 8 domain specialists per §10.1
 * resolution. The full taxonomy:
 *
 *   - regime           — basket regime + transition prob (B1, domain: all)
 *   - aletheia         — per-source learned trust + signal direction weighting (B1, domain: all)
 *   - empirical-prior  — 24h forward-return distribution for signal pattern (B2, domain: all)
 *   - crypto-majors    — funding rate + depth + 24h trend for majors (B2, domain: crypto)
 *   - equities         — sector strength + RS + drawdown (B2, domain: equities)
 *   - memes            — volume velocity + KOL chatter (B2, domain: crypto + memes list)
 *   - defi             — pool APR + arb spread + IL (B2, domain: defi)
 *   - polymarket       — odds shift + resolution proximity + volume (B2, domain: polymarket)
 *
 * Caller can override via runDeliberation({ specialists: [...] }) for tests
 * or operator-supplied custom sets (e.g. dashboard "explain this trade"
 * uses a focused subset).
 */

import { regimeSpecialist, REGIME_SPECIALIST_NAME } from './regime.mjs';
import { aletheiaSpecialist, ALETHEIA_SPECIALIST_NAME } from './aletheia.mjs';
import { empiricalPriorSpecialist, EMPIRICAL_PRIOR_SPECIALIST_NAME } from './empirical-prior.mjs';
import { cryptoMajorsSpecialist, CRYPTO_MAJORS_SPECIALIST_NAME } from './crypto-majors.mjs';
import { equitiesSpecialist, EQUITIES_SPECIALIST_NAME } from './equities.mjs';
import { memesSpecialist, MEMES_SPECIALIST_NAME } from './memes.mjs';
import { defiSpecialist, DEFI_SPECIALIST_NAME } from './defi.mjs';
import { polymarketSpecialist, POLYMARKET_SPECIALIST_NAME } from './polymarket.mjs';

export const ACTIVE_SPECIALISTS = Object.freeze([
  regimeSpecialist,
  aletheiaSpecialist,
  empiricalPriorSpecialist,
  cryptoMajorsSpecialist,
  equitiesSpecialist,
  memesSpecialist,
  defiSpecialist,
  polymarketSpecialist,
]);

export const SPECIALIST_NAMES = Object.freeze([
  REGIME_SPECIALIST_NAME,
  ALETHEIA_SPECIALIST_NAME,
  EMPIRICAL_PRIOR_SPECIALIST_NAME,
  CRYPTO_MAJORS_SPECIALIST_NAME,
  EQUITIES_SPECIALIST_NAME,
  MEMES_SPECIALIST_NAME,
  DEFI_SPECIALIST_NAME,
  POLYMARKET_SPECIALIST_NAME,
]);

/**
 * Run all active specialists in parallel against the evidence package.
 * Failed specialists return abstain voices via makeSpecialist()'s
 * safety wrapper — they never throw.
 */
export async function callAllSpecialists(pkg, specialists = ACTIVE_SPECIALISTS) {
  return Promise.all(specialists.map(s => s(pkg)));
}
