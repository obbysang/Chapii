import { describe, expect, it } from 'vitest';
import { LocalHarnessBackend } from './backend-local.js';
import { runHarness } from './runner.js';

describe('red-team harness (local)', () => {
  it('contains every attack and preserves all invariants', async () => {
    const backend = new LocalHarnessBackend();
    const report = await runHarness({ backend });

    expect(report.total).toBeGreaterThanOrEqual(26);
    expect(report.attacks).toBeGreaterThanOrEqual(20);
    expect(report.attacksContained).toBe(report.attacks);
    expect(report.controlsPassed).toBe(report.controls);
    expect(report.invariantsOk).toBe(true);
    expect(report.passed).toBe(report.total - report.skipped);
  }, 60_000);
});
