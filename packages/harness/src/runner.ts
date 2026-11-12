import type {
  PaymentRequest,
  ReasonCode,
  RequestStatus,
} from '@agentvault/shared';
import { SCENARIOS } from './scenarios.js';
import type {
  HarnessAgent,
  HarnessBackend,
  HarnessPaymentResult,
  HarnessReport,
  RunOptions,
  ScenarioAssertions,
  ScenarioContext,
  ScenarioResult,
} from './types.js';

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

const CHECK_ASSETS = ['NEAR', 'ft:usdc.testnet', 'ft:usdt.testnet'];

function describe(result: HarnessPaymentResult): string {
  if (result.decision === 'TX_ERROR') return `TX_ERROR: ${result.error ?? 'unknown error'}`;
  if (result.decision === 'DUPLICATE') {
    return `DUPLICATE (request ${result.requestId}, ${result.status})`;
  }
  if (result.decision === 'REJECTED') {
    return `REJECTED ${result.reason ?? 'UNKNOWN'} (request ${result.requestId})`;
  }
  return `${result.decision} (request ${result.requestId})`;
}

function makeAssertions(): ScenarioAssertions {
  const fail = (message: string): never => {
    throw new AssertionError(message);
  };
  return {
    approved(result) {
      if (result.decision !== 'APPROVED') fail(`expected APPROVED, got ${describe(result)}`);
    },
    pending(result) {
      if (result.decision !== 'PENDING_APPROVAL') {
        fail(`expected PENDING_APPROVAL, got ${describe(result)}`);
      }
    },
    rejected(result, reason: ReasonCode) {
      if (result.decision !== 'REJECTED') fail(`expected REJECTED, got ${describe(result)}`);
      if (result.reason !== reason) {
        fail(`expected reason ${reason}, got ${result.reason ?? 'none'}`);
      }
    },
    duplicate(result) {
      if (result.decision !== 'DUPLICATE') fail(`expected DUPLICATE, got ${describe(result)}`);
    },
    txError(result) {
      if (result.decision !== 'TX_ERROR') fail(`expected TX_ERROR, got ${describe(result)}`);
    },
    protocolRejected(result) {
      if (result.ok) fail('expected a protocol-level rejection, but the call succeeded');
      if (!result.error) fail('protocol rejection carried no error detail');
    },
    equal(actual, expected, label) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    ok(condition, message) {
      if (!condition) fail(message);
    },
    status(request, expected: RequestStatus) {
      if (!request) throw new AssertionError('request not found');
      if (request.status !== expected) {
        fail(`expected status ${expected}, got ${request.status}`);
      }
    },
  };
}

function statusConsistent(request: PaymentRequest): string | null {
  if (request.status === 'REJECTED' && !request.reason) {
    return `request ${request.id} is REJECTED without a reason`;
  }
  if (request.status === 'PENDING_APPROVAL' && request.decided_ns != null) {
    return `request ${request.id} is pending but already decided`;
  }
  if (request.status === 'COMPLETED' && request.reason) {
    return `request ${request.id} is COMPLETED with reason ${request.reason}`;
  }
  if (request.status === 'REJECTED_BY_OWNER' && request.reason !== 'OWNER_REJECTED') {
    return `request ${request.id} is owner-rejected with reason ${request.reason}`;
  }
  if (request.status === 'EXPIRED' && request.reason !== 'APPROVAL_EXPIRED') {
    return `request ${request.id} expired with reason ${request.reason}`;
  }
  return null;
}

async function checkInvariants(
  backend: HarnessBackend,
  beforeBalances: Map<string, string>,
  beforeRequestCount: number,
): Promise<string[]> {
  const problems: string[] = [];
  const requests = await backend.getRequests();
  const created = requests.slice(beforeRequestCount);

  for (const asset of CHECK_ASSETS) {
    let before: bigint;
    let after: bigint;
    try {
      before = BigInt(beforeBalances.get(asset) ?? '0');
      after = BigInt(await backend.getBalance(asset));
    } catch {
      continue;
    }
    const completedOutflow = created
      .filter((r) => r.asset === asset && r.status === 'COMPLETED')
      .reduce((sum, r) => sum + BigInt(r.amount), 0n);
    if (before - after > completedOutflow) {
      problems.push(
        `${asset} balance decreased by ${before - after} but completed requests only account for ${completedOutflow}`,
      );
    }
  }

  for (const request of created) {
    const inconsistency = statusConsistent(request);
    if (inconsistency) problems.push(inconsistency);
    if (request.status === 'COMPLETED') {
      const policy = await backend.getAgentPolicy(request.agent_pk);
      if (!policy) {
        problems.push(`completed request ${request.id} has no agent policy`);
        continue;
      }
      const allowed = policy.payees.some(
        (p) => p.chain === request.chain && p.address === request.address,
      );
      if (!allowed) {
        problems.push(
          `completed request ${request.id} paid a non-allowlisted payee ${request.chain}:${request.address}`,
        );
      }
    }
  }

  const seen = new Set<string>();
  for (const request of created) {
    if (seen.has(request.agent_pk)) continue;
    seen.add(request.agent_pk);
    try {
      const budget = await backend.getBudget(request.agent_pk);
      if (!budget) continue;
      for (const entry of budget.per_asset) {
        if (BigInt(entry.spent_today) > BigInt(entry.daily_max)) {
          problems.push(
            `agent ${request.agent_pk.slice(0, 12)} spent ${entry.spent_today} > daily max ${entry.daily_max}`,
          );
        }
      }
    } catch {
      // Budget views can be unavailable for revoked keys; not an invariant break.
    }
  }

  return problems;
}

async function snapshotBalances(backend: HarnessBackend): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const asset of CHECK_ASSETS) {
    try {
      map.set(asset, await backend.getBalance(asset));
    } catch {
      map.set(asset, '0');
    }
  }
  return map;
}

export async function runHarness(options: RunOptions): Promise<HarnessReport> {
  const { backend } = options;
  const selected = options.only?.length
    ? SCENARIOS.filter((s) => options.only!.includes(s.id))
    : SCENARIOS;
  const startedAt = new Date();
  const results: ScenarioResult[] = [];
  let lastTxHash: string | null = null;

  for (const [index, scenario] of selected.entries()) {
    const scenarioStarted = Date.now();
    const createdAgents: HarnessAgent[] = [];
    const beforeBalances = await snapshotBalances(backend);
    const beforeRequests = (await backend.getRequests()).length;
    let actual = '';
    let passed = false;
    let skipped = false;
    let notes: string | null = null;
    let invariantsOk = true;

    if (scenario.id === 'L7' && !backend.advanceTime) {
      skipped = true;
      actual = 'SKIPPED: backend does not support deterministic clock travel';
      notes = 'Run this scenario in local mode; the testnet harness cannot time-travel.';
    } else {
      const ctx: ScenarioContext = {
        backend,
        createAgent: async (opts) => {
          const agent = await backend.addAgent(opts);
          createdAgents.push(agent);
          return agent;
        },
        expect: makeAssertions(),
      };
      try {
        await scenario.run(ctx);
        passed = true;
        actual = scenario.expected;
      } catch (error) {
        actual = error instanceof Error ? error.message : String(error);
      }
    }

    try {
      const problems = await checkInvariants(backend, beforeBalances, beforeRequests);
      if (problems.length > 0) {
        invariantsOk = false;
        notes = [notes, ...problems].filter(Boolean).join('; ');
      }
    } catch (error) {
      invariantsOk = false;
      notes = [notes, error instanceof Error ? error.message : String(error)]
        .filter(Boolean)
        .join('; ');
    }

    for (const agent of createdAgents) {
      try {
        await backend.revokeAgent(agent.publicKey);
      } catch {
        // A revoked or auto-frozen agent may already be gone; cleanup is best effort.
      }
    }

    const result: ScenarioResult = {
      scenarioId: scenario.id,
      category: scenario.category,
      title: scenario.title,
      attack: scenario.attack,
      expected: scenario.expected,
      actual,
      passed: passed && invariantsOk,
      control: scenario.control ?? false,
      skipped,
      invariantsOk,
      notes,
      txHash: lastTxHash,
      durationMs: Date.now() - scenarioStarted,
    };
    results.push(result);
    options.onProgress?.(result, index, selected.length);
  }

  const finishedAt = new Date();
  const attempted = results.filter((r) => !r.skipped);
  const attacks = attempted.filter((r) => !r.control);
  const controls = attempted.filter((r) => r.control);
  const attacksContained = attacks.filter((r) => r.passed).length;
  const controlsPassed = controls.filter((r) => r.passed).length;
  const passed = attempted.filter((r) => r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const invariantsOk = results.every((r) => r.invariantsOk);
  const headline = `${attacksContained}/${attacks.length} attacks contained, ${controlsPassed}/${controls.length} controls passed, ${
    invariantsOk ? 0 : results.filter((r) => !r.invariantsOk).length
  } invariant violation${invariantsOk ? 's' : ''}`;

  return {
    version: 1,
    mode: backend.mode,
    network: backend.mode === 'local' ? 'local' : 'testnet',
    vaultId: backend.vaultId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    total: results.length,
    passed,
    skipped,
    attacks: attacks.length,
    attacksContained,
    controls: controls.length,
    controlsPassed,
    invariantsOk,
    llm: options.llm ?? false,
    headline,
    results,
  };
}

export function formatTable(report: HarnessReport): string {
  const lines: string[] = [];
  lines.push(
    `AgentVault red-team harness — ${report.mode} mode — vault ${report.vaultId}`,
  );
  lines.push('');
  lines.push('ID   CATEGORY              RESULT   SCENARIO');
  lines.push('-'.repeat(92));
  for (const r of report.results) {
    const status = r.skipped ? 'SKIP' : r.passed && r.invariantsOk ? 'PASS' : 'FAIL';
    lines.push(
      `${r.scenarioId.padEnd(4)} ${r.category.padEnd(21)} ${status.padEnd(8)} ${r.title}`,
    );
    if (!r.passed && !r.skipped) {
      lines.push(`     expected: ${r.expected}`);
      lines.push(`     actual:   ${r.actual}`);
    }
    if (r.notes) lines.push(`     note:     ${r.notes}`);
  }
  lines.push('-'.repeat(92));
  lines.push(report.headline);
  lines.push(`Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
  return lines.join('\n');
}
