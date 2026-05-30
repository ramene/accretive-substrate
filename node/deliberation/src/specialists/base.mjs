/**
 * @accretive-substrate/deliberation — Specialist base contract.
 *
 * A specialist is a function `(evidencePackage) => Promise<Voice>`. The base
 * helper here provides:
 *   - makeSpecialist() — wraps an argue fn with abstain shortcuts + error
 *     handling so a single buggy specialist can never crash a deliberation.
 *   - abstainBecause() — convenience for the common "out of scope" path.
 *   - voteFor() — convenience for the common buy/sell/hold path with
 *     standardised citation shape.
 *
 * Path B cross-language note: the Go equivalent at <this repo>/go/deliberation/
 * MUST produce voices with identical {specialist, verdict, confidence,
 * rationale, citations, abstained_because} shape. Fixture tests check this.
 */

import { validateVoice, VERDICTS } from '../schema.mjs';

/**
 * Wrap an argue function into a safe specialist.
 *
 * @param {string} name - the specialist's unique name (becomes voice.specialist)
 * @param {Array<string>} domains - the symbol/venue domains it cares about (for fast abstain)
 * @param {function(EvidencePackage): Promise<Voice>} argueFn
 * @returns {function(EvidencePackage): Promise<Voice>}
 */
export function makeSpecialist(name, domains, argueFn) {
  return async function safeSpecialist(pkg) {
    try {
      const voice = await argueFn(pkg);
      // Stamp the name so argue() doesn't have to remember.
      const stamped = { ...voice, specialist: name };
      // Validate or coerce to safe abstain.
      const v = validateVoice(stamped);
      if (!v.ok) {
        return abstainBecause(name, `validation: ${v.errors.join('; ')}`);
      }
      return stamped;
    } catch (err) {
      return abstainBecause(name, `argue() threw: ${err.message}`);
    }
  };
}

/**
 * Build a clean abstain Voice with a reason.
 */
export function abstainBecause(specialistName, reason) {
  return {
    specialist: specialistName,
    verdict: 'abstain',
    confidence: 0,
    rationale: reason,
    citations: [],
    abstained_because: reason,
  };
}

/**
 * Build a verdict Voice with citations.
 */
export function voteFor(specialistName, verdict, confidence, rationale, citations = []) {
  if (!VERDICTS.includes(verdict)) {
    return abstainBecause(specialistName, `invalid verdict ${verdict} from argue()`);
  }
  if (verdict === 'abstain') {
    return abstainBecause(specialistName, rationale || 'abstained without reason');
  }
  return {
    specialist: specialistName,
    verdict,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    rationale: String(rationale || ''),
    citations: Array.isArray(citations) ? citations : [],
    abstained_because: null,
  };
}

/**
 * Helper: does this evidence package's symbol/venue match any of the
 * specialist's declared domains?
 *
 * Domain strings:
 *   'crypto'          → matches venue in {kucoin, binance}
 *   'crypto-majors'   → matches venue in {kucoin, binance} AND symbol in {BTC,ETH,SOL,…}
 *   'crypto-memes'    → venue kucoin AND symbol in memes list
 *   'equities'        → venue alpaca
 *   'forex'           → venue oanda
 *   'polymarket'      → venue polymarket
 *   'defi'            → venue aerodrome or chain != centralized
 *   'all'             → always match (regime, aletheia, empirical-prior — domain-agnostic)
 */
export function matchesDomain(pkg, domains) {
  if (!Array.isArray(domains) || domains.length === 0) return true;
  if (domains.includes('all')) return true;
  const venue = String(pkg?.trigger?.venue || '').toLowerCase();
  if (domains.includes('crypto') && (venue === 'kucoin' || venue === 'binance')) return true;
  if (domains.includes('equities') && venue === 'alpaca') return true;
  if (domains.includes('forex') && venue === 'oanda') return true;
  if (domains.includes('polymarket') && venue === 'polymarket') return true;
  if (domains.includes('defi') && (venue === 'aerodrome' || venue === 'uniswap')) return true;
  return false;
}
