import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  FlaskConical,
  Info,
  Lock,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Terminal,
  Timer,
  XCircle,
} from 'lucide-react';
import type { ScenarioResult } from '@agentvault/harness';
import type { HarnessResultDto, HarnessRunDto } from '@agentvault/shared';
import { api, ApiError } from '../lib/api';
import { useVault } from '../state/vault';
import { useToast } from '../state/toast';
import {
  cn,
  copyText,
  pct,
  shortDate,
  truncateMiddle,
} from '../lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  Panel,
  ProgressBar,
  SectionTitle,
  Skeleton,
  Stat,
  Tabs,
} from '../components/ui';
import { ApiOffline, NoVaultState } from '../components/Guards';

interface ResultRow {
  scenarioId: string;
  category: string;
  title: string;
  attack: string;
  expected: string;
  actual: string;
  passed: boolean;
  invariantsOk: boolean;
  durationMs: number;
  notes?: string | null;
  txHash?: string | null;
  control?: boolean;
}

function fromDto(result: HarnessResultDto): ResultRow {
  return {
    ...result,
    control: result.control ?? result.scenarioId.startsWith('C'),
  };
}

function fromScenario(result: ScenarioResult): ResultRow {
  return {
    scenarioId: result.scenarioId,
    category: result.category,
    title: result.title,
    attack: result.attack,
    expected: result.expected,
    actual: result.actual,
    passed: result.passed,
    invariantsOk: result.invariantsOk,
    durationMs: result.durationMs,
    notes: result.notes,
    txHash: result.txHash,
    control: result.control,
  };
}

function ResultTable({
  results,
  onSelect,
}: {
  results: ResultRow[];
  onSelect: (result: ResultRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 font-semibold">ID</th>
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 font-semibold">Scenario</th>
            <th className="px-3 py-2 font-semibold">Expected</th>
            <th className="px-3 py-2 font-semibold">Actual</th>
            <th className="px-3 py-2 font-semibold">Result</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.scenarioId} className="table-row">
              <td className="px-3 py-2.5">
                <span className="chip border-white/10 bg-white/[0.04] font-mono text-[10px] text-slate-400">
                  {result.scenarioId}
                </span>
                {result.control ? (
                  <span className="ml-1 text-[9px] uppercase tracking-wider text-slate-600">ctrl</span>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-[11px] text-slate-500">{result.category}</td>
              <td className="px-3 py-2.5">
                <p className="max-w-[240px] truncate text-xs text-slate-200" title={result.title}>{result.title}</p>
                <p className="max-w-[240px] truncate text-[10px] text-slate-600" title={result.attack}>{result.attack}</p>
              </td>
              <td className="px-3 py-2.5">
                <span className="mono text-[10px] text-slate-400">{result.expected}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className="mono text-[10px] text-slate-400">{result.actual}</span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      'chip w-fit text-[10px]',
                      result.passed
                        ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                        : 'border-rose-400/25 bg-rose-400/10 text-rose-300',
                    )}
                  >
                    {result.passed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                    {result.passed ? 'PASS' : 'FAIL'}
                  </span>
                  {!result.invariantsOk ? (
                    <span className="text-[9px] text-rose-400">invariant!</span>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => onSelect(result)}
                  className="rounded p-1 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200"
                  aria-label={`Inspect ${result.scenarioId}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Security() {
  const { vaultId, summary, health, error, isLocal, lastEvent } = useVault();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [live, setLive] = useState<ScenarioResult[]>([]);
  const [liveTotal, setLiveTotal] = useState(34);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<'all' | 'attacks' | 'controls' | 'failures'>('all');
  const [detail, setDetail] = useState<ResultRow | null>(null);
  const [showOverview, setShowOverview] = useState(false);

  const runsQuery = useQuery({
    queryKey: ['harnessRuns', vaultId],
    queryFn: () => api.harnessRuns(vaultId as string),
    enabled: Boolean(vaultId),
    refetchInterval: runId ? 2000 : false,
  });

  const runs = runsQuery.data?.items ?? [];
  const activeRun: HarnessRunDto | undefined = useMemo(() => {
    if (selectedRun) return runs.find((run) => run.id === selectedRun) ?? runs[0];
    return runs[0];
  }, [runs, selectedRun]);

  const runQuery = useQuery({
    queryKey: ['harnessRun', activeRun?.id],
    queryFn: () => api.harnessRun(activeRun?.id as string),
    enabled: Boolean(activeRun?.id),
    refetchInterval: (query) => {
      const data = query.state.data as HarnessRunDto | undefined;
      return data && ['QUEUED', 'RUNNING'].includes(data.status) ? 1500 : false;
    },
  });

  const current = runQuery.data ?? activeRun;

  const start = useMutation({
    mutationFn: () => api.startHarness(vaultId as string),
    onSuccess: async (data) => {
      setRunId(data.runId);
      setSelectedRun(null);
      setLive([]);
      setLiveTotal(34);
      toast.info('Red-team run started', '34 scenarios against an isolated clone of this vault.');
      await queryClient.invalidateQueries({ queryKey: ['harnessRuns', vaultId] });
    },
    onError: (startError) => {
      const message =
        startError instanceof ApiError
          ? `${startError.code}: ${startError.message}`
          : startError instanceof Error
            ? startError.message
            : String(startError);
      toast.error('Could not start the suite', message);
    },
  });

  useEffect(() => {
    if (!lastEvent) return;
    const { event, data } = lastEvent;
    if (event === 'harness.progress') {
      const result = data.result as ScenarioResult | undefined;
      if (result) {
        setLive((existing) => [...existing.filter((item) => item.scenarioId !== result.scenarioId), result]);
        setLiveTotal(Number(data.total ?? 34));
      }
    }
    if (event === 'harness.started') {
      setRunId(String(data.runId ?? ''));
      setLive([]);
    }
    if (event === 'harness.completed') {
      void queryClient.invalidateQueries({ queryKey: ['harnessRuns', vaultId] });
      setRunId(null);
      if (data.headline) toast.success('Red-team complete', String(data.headline));
      if (data.error) toast.error('Red-team failed', String(data.error));
    }
  }, [lastEvent, queryClient, vaultId, toast]);

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;

  const running = start.isPending || Boolean(runId) || current?.status === 'RUNNING' || current?.status === 'QUEUED';
  const dbResults: ResultRow[] = (current?.results ?? []).map(fromDto);
  const liveResults = live.map(fromScenario);
  const merged: ResultRow[] = running
    ? [...liveResults, ...dbResults.filter((row) => !liveResults.some((item) => item.scenarioId === row.scenarioId))]
    : dbResults.length > 0
      ? dbResults
      : liveResults;

  const passedCount = running ? liveResults.filter((result) => result.passed).length : (current?.passed ?? 0);
  const totalCount = running ? liveTotal : (current?.total ?? 34);
  const attacks = merged.filter((result) => !result.control);
  const controls = merged.filter((result) => result.control);
  const attacksContained = attacks.filter((result) => result.passed).length;
  const controlsPassed = controls.filter((result) => result.passed).length;
  const invariantsOk =
    merged.length > 0 ? merged.every((result) => result.invariantsOk) : (current?.invariantsOk ?? true);

  const filtered = merged.filter((result) => {
    if (resultFilter === 'attacks') return !result.control;
    if (resultFilter === 'controls') return result.control;
    if (resultFilter === 'failures') return !result.passed || !result.invariantsOk;
    return true;
  });

  const enabled = health?.harnessEnabled ?? true;
  const headline = current?.status === 'DONE'
    ? `${attacksContained}/${attacks.length || 27} attacks contained, ${controlsPassed}/${controls.length || 7} controls passed, ${invariantsOk ? '0' : '1+'} invariant violations`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="red" dot>adversarial suite</Badge>
            <Badge tone="slate">34 scenarios</Badge>
            {isLocal ? <Badge tone="amber">isolated simulator</Badge> : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Red-team suite</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            The same policy engine, attacked on purpose. Every scenario asserts the decision, the
            reason code and the budget invariants after the call.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setShowOverview(true)}>
            <Info className="h-4 w-4" /> How it works
          </Button>
          <Button
            variant="primary"
            loading={running}
            disabled={!enabled || running}
            onClick={() => start.mutate()}
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running…' : 'Run 34 scenarios'}
          </Button>
        </div>
      </div>

      {!enabled ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5 text-xs text-amber-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The attack suite is disabled on this deployment. Set{' '}
            <code className="rounded bg-black/30 px-1 font-mono">HARNESS_ENABLED=true</code> and
            keep <code className="rounded bg-black/30 px-1 font-mono">NEAR_NETWORK</code> on{' '}
            <code className="rounded bg-black/30 px-1 font-mono">local</code> or{' '}
            <code className="rounded bg-black/30 px-1 font-mono">testnet</code>. It never runs on
            mainnet.
          </span>
        </div>
      ) : null}

      <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', running && 'opacity-100')}>
        <Stat
          label="Attacks contained"
          value={`${attacksContained}/${attacks.length || 27}`}
          hint="No funds moved outside policy"
          tone="green"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <Stat
          label="Controls passed"
          value={`${controlsPassed}/${controls.length || 7}`}
          hint="Legitimate flows still work"
          tone="blue"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <Stat
          label="Invariant violations"
          value={invariantsOk ? '0' : '≥1'}
          hint="Budget and rate accounting"
          tone={invariantsOk ? 'green' : 'red'}
          icon={invariantsOk ? <CheckCircle2 className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}
        />
        <Stat
          label="Scenarios complete"
          value={`${passedCount}/${totalCount}`}
          hint={running ? 'live progress' : current ? shortDate(current.finishedAt ?? current.startedAt) : 'not run yet'}
          tone="blue"
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      {running ? (
        <Panel className="p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-2 text-slate-300">
              <Radar className="h-4 w-4 animate-pulse text-rose-300" /> Running attack suite against isolated clone
            </span>
            <span className="text-slate-500">
              {liveResults.length}/{liveTotal}
            </span>
          </div>
          <ProgressBar value={pct(liveResults.length, liveTotal)} tone="blue" />
          <p className="mt-2 text-[11px] text-slate-500">
            The run uses a fresh vault cloned from this vault&apos;s balances. It does not add
            receipts to your feed and cannot touch live funds.
          </p>
        </Panel>
      ) : null}

      {headline ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
          <div>
            <p className="text-sm font-semibold text-emerald-200">{headline}</p>
            <p className="mt-0.5 text-[11px] text-emerald-200/60">
              {current?.status === 'ERROR' ? 'Run ended with an error.' : 'Deterministic run. No LLM was used to make decisions.'}
            </p>
          </div>
          <Button
            variant="ghost"
            className="text-xs"
            onClick={() => void copyText(headline).then((ok) => ok && toast.success('Headline copied'))}
          >
            <Copy className="h-3.5 w-3.5" /> Copy headline
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Panel className="p-5">
          <SectionTitle
            title="Scenario results"
            subtitle={
              current
                ? `Run ${current.id.slice(0, 8)} · ${current.vaultId}`
                : 'Run the suite to populate results.'
            }
            actions={
              <Tabs
                value={resultFilter}
                onChange={setResultFilter}
                tabs={[
                  { id: 'all', label: 'All', count: merged.length },
                  { id: 'attacks', label: 'Attacks', count: attacks.length },
                  { id: 'controls', label: 'Controls', count: controls.length },
                  { id: 'failures', label: 'Failures', count: merged.filter((result) => !result.passed || !result.invariantsOk).length },
                ]}
              />
            }
          />
          {runsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={merged.length === 0 ? 'No run yet' : 'No scenarios match this filter'}
              description={
                merged.length === 0
                  ? 'Start a run to execute 27 attacks and 7 controls against a throwaway clone.'
                  : 'Switch to All or Failures to see the rest of the run.'
              }
              icon={<FlaskConical className="h-5 w-5" />}
              action={
                merged.length === 0 && enabled ? (
                  <Button variant="primary" onClick={() => start.mutate()}>
                    <Play className="h-4 w-4" /> Run the suite
                  </Button>
                ) : null
              }
            />
          ) : (
            <ResultTable results={filtered} onSelect={setDetail} />
          )}
        </Panel>

        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle title="What is asserted" />
            <ul className="space-y-2.5 text-xs text-slate-400">
              {[
                'The decision is exactly APPROVED, PENDING_APPROVAL, REJECTED or DUPLICATE.',
                'The reason code matches the specific policy rule, not a generic failure.',
                'Daily spend and rate counters are unchanged after a rejection.',
                'Agent keys cannot call owner-only methods.',
                'A frozen or revoked agent cannot request payments.',
                'Legitimate flows still settle: the control cases must pass.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <span className="text-xs font-semibold text-slate-300">Run history</span>
              <Badge tone="slate">{runs.length}</Badge>
            </div>
            {runs.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">No runs recorded.</p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {runs.slice(0, 6).map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRun(run.id)}
                      className={cn(
                        'flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-white/[0.03]',
                        current?.id === run.id && 'bg-white/[0.03]',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          run.status === 'DONE'
                            ? 'bg-emerald-400'
                            : run.status === 'ERROR'
                              ? 'bg-rose-400'
                              : 'bg-sky-400 animate-pulse',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-slate-300">
                          {run.status === 'DONE' ? `${run.passed}/${run.total} passed` : run.status.toLowerCase()}
                        </span>
                        <span className="block truncate text-[10px] text-slate-600">
                          {shortDate(run.startedAt ?? run.finishedAt)} · {run.id.slice(0, 8)}
                        </span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Isolation" />
            <div className="space-y-2 text-[11px] leading-relaxed text-slate-500">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                Runs execute against an ephemeral vault cloned from the demo balances, never the
                persisted vault. Receipts from the run never enter your feed.
              </p>
              <p className="flex items-start gap-2">
                <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
                The suite is hard-blocked on mainnet. Testnet needs an owner key and a deployed
                vault in the API environment.
              </p>
              <p className="flex items-start gap-2">
                <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                Run it headless: <code className="rounded bg-white/[0.05] px-1 font-mono">pnpm harness --network local --quiet</code>
              </p>
            </div>
          </Panel>
        </div>
      </div>

      <Modal open={showOverview} onClose={() => setShowOverview(false)} wide title="How the red-team suite works">
        <div className="space-y-4 text-sm text-slate-300">
          <p>
            The harness is deterministic. It creates throwaway agents with known policies and then
            tries to break them: bad payees, lookalike addresses, oversized amounts, rate-limit
            floods, expired policies, revoked keys, owner-only calls from agent keys, duplicate
            client refs, and cross-chain destination-asset confusion.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { value: '27', label: 'attack scenarios' },
              { value: '7', label: 'control scenarios' },
              { value: '0', label: 'LLM decisions' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-center">
                <p className="text-lg font-semibold text-slate-100">{item.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Each scenario asserts the exact decision and reason code, then compares budget counters
            before and after. A control scenario must still succeed, so the suite cannot pass by
            rejecting everything. The invariant check confirms that only policy-approved spends
            change the daily counter and that rejected calls never consume rate or budget.
          </p>
          <p className="text-xs leading-relaxed text-slate-400">
            In local mode the backend is an in-memory clone of the vault. On testnet the same
            scenarios run against a real contract with a funded owner key, and the transaction hash
            is recorded per scenario. The suite refuses to run on mainnet.
          </p>
        </div>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} wide title={detail ? `${detail.scenarioId} · ${detail.title}` : 'Scenario'}>
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone={detail.passed ? 'green' : 'red'}>{detail.passed ? 'passed' : 'failed'}</Badge>
              <Badge tone={detail.invariantsOk ? 'green' : 'red'}>
                invariants {detail.invariantsOk ? 'ok' : 'violated'}
              </Badge>
              <Badge tone="slate">{detail.category}</Badge>
              <Badge tone="slate">{detail.durationMs} ms</Badge>
              {detail.control ? <Badge tone="blue">control</Badge> : null}
            </div>
            <div>
              <p className="label">Attack</p>
              <p className="text-xs leading-relaxed text-slate-400">{detail.attack}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.07] bg-ink-950/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Expected</p>
                <p className="mono mt-1 text-xs text-slate-300">{detail.expected}</p>
              </div>
              <div className="rounded-lg border border-white/[0.07] bg-ink-950/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Actual</p>
                <p className="mono mt-1 text-xs text-slate-300">{detail.actual}</p>
              </div>
            </div>
            {detail.notes ? (
              <div>
                <p className="label">Notes</p>
                <p className="text-xs text-slate-400">{detail.notes}</p>
              </div>
            ) : null}
            {detail.txHash ? (
              <div>
                <p className="label">Transaction</p>
                <p className="mono break-all text-xs text-slate-400">{detail.txHash}</p>
              </div>
            ) : null}
            <p className="text-[11px] leading-relaxed text-slate-500">
              {detail.passed
                ? 'The harness asserted the decision and reason against the policy engine and verified the budget invariants afterwards.'
                : 'This scenario did not match the expected contract behaviour. Treat it as a release blocker, not a flaky test.'}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
