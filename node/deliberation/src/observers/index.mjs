/**
 * @accretive-substrate/deliberation/observers — public surface.
 *
 * Each observer detects a recurring pattern in the deliberations table and
 * emits one or more `coach_provisional` accretions with `evidence_refs`
 * FK arrays. The operator dashboard surfaces unconfirmed provisionals for
 * one-click promote/dismiss.
 *
 * B3.Node ships the first observer: per-symbol drift. Subsequent observers
 * (specialist dissent, hard-block cascade, soft-conflict cluster, verdict
 * flip-flop, high-dissent persistence) extend this pattern.
 *
 * runAllObservers() invokes the active set and returns an aggregate
 * report — used by the node cron entry that fires every 5 minutes.
 */

export { detectPerSymbolDrift, runPerSymbolDriftObserver } from './per-symbol-drift.mjs';
export { detectSpecialistDissent, runSpecialistDissentObserver } from './specialist-dissent.mjs';
export { detectHardBlockCascade, runHardBlockCascadeObserver } from './hard-block-cascade.mjs';
export { detectSoftConflictCluster, runSoftConflictClusterObserver } from './soft-conflict-cluster.mjs';
export { detectVerdictFlipFlop, runVerdictFlipFlopObserver } from './verdict-flip-flop.mjs';
export { detectHighDissentPersistence, runHighDissentPersistenceObserver } from './high-dissent-persistence.mjs';

import { runPerSymbolDriftObserver } from './per-symbol-drift.mjs';
import { runSpecialistDissentObserver } from './specialist-dissent.mjs';
import { runHardBlockCascadeObserver } from './hard-block-cascade.mjs';
import { runSoftConflictClusterObserver } from './soft-conflict-cluster.mjs';
import { runVerdictFlipFlopObserver } from './verdict-flip-flop.mjs';
import { runHighDissentPersistenceObserver } from './high-dissent-persistence.mjs';

const ACTIVE_OBSERVERS = [
  { name: 'per-symbol-drift', run: runPerSymbolDriftObserver },
  { name: 'specialist-dissent', run: runSpecialistDissentObserver },
  { name: 'hard-block-cascade', run: runHardBlockCascadeObserver },
  { name: 'soft-conflict-cluster', run: runSoftConflictClusterObserver },
  { name: 'verdict-flip-flop', run: runVerdictFlipFlopObserver },
  { name: 'high-dissent-persistence', run: runHighDissentPersistenceObserver },
];

export async function runAllObservers(options = {}) {
  const reports = {};
  let totalDetected = 0;
  let totalEmitted = 0;
  for (const obs of ACTIVE_OBSERVERS) {
    try {
      const r = await obs.run(options);
      reports[obs.name] = r;
      totalDetected += r.detected || 0;
      totalEmitted += r.emitted || 0;
    } catch (e) {
      reports[obs.name] = { error: e.message };
    }
  }
  return {
    ran_at: new Date().toISOString(),
    observers: reports,
    total_detected: totalDetected,
    total_emitted: totalEmitted,
  };
}
