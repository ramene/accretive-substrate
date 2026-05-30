/**
 * Fixture-based integration tests. Each JSON file in test/fixtures/ has an
 * evidence_package + expected_voices + expected_adjudication + expected_final_verdict.
 *
 * The SAME fixture files are loaded by the Go test suite at
 * <this repo>/go/deliberation/internal/test/fixtures/ (vendored copies, kept
 * in sync by B6 tuning loop). This proves cross-language parity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runDeliberation } from '../src/orchestrator.mjs';

const FIXTURE_DIR = new URL('./fixtures/', import.meta.url).pathname;

function loadFixtures() {
  return readdirSync(FIXTURE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      filename: f,
      ...JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')),
    }));
}

for (const fixture of loadFixtures()) {
  test(`fixture: ${fixture.name} (${fixture.filename})`, async () => {
    const r = await runDeliberation(
      { evidence: fixture.evidence_package, source_pipeline: 'node' },
      { persist: async () => ({ id: 1, ts: new Date(), ok: true }) },
    );

    // Voice expectations (subset — only check specialists named in fixture).
    if (fixture.expected_voices) {
      for (const [name, expectedVerdict] of Object.entries(fixture.expected_voices)) {
        const voice = r.voices.find(v => v.specialist === name);
        assert.ok(voice, `missing voice for specialist ${name}`);
        assert.equal(
          voice.verdict,
          expectedVerdict,
          `${fixture.name}: ${name} expected ${expectedVerdict}, got ${voice.verdict} (${voice.rationale})`,
        );
      }
    }

    // Adjudication.
    if (fixture.expected_adjudication?.verdict) {
      assert.equal(
        r.adjudication.verdict,
        fixture.expected_adjudication.verdict,
        `${fixture.name}: adjudication expected ${fixture.expected_adjudication.verdict}, got ${r.adjudication.verdict}`,
      );
    }

    // Guardrail.
    if (fixture.expected_guardrail?.policy_applied) {
      assert.equal(
        r.guardrail.policy_applied,
        fixture.expected_guardrail.policy_applied,
        `${fixture.name}: guardrail policy expected ${fixture.expected_guardrail.policy_applied}, got ${r.guardrail.policy_applied}`,
      );
    }

    // Final verdict.
    if (fixture.expected_final_verdict) {
      assert.equal(
        r.final_verdict,
        fixture.expected_final_verdict,
        `${fixture.name}: final expected ${fixture.expected_final_verdict}, got ${r.final_verdict}`,
      );
    }
  });
}
