import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  Copy,
  FlaskConical,
  Globe2,
  Info,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Repeat,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useVault } from '../state/vault';
import { useToast } from '../state/toast';
import { useWallet } from '../state/wallet';
import { amountWithSymbol, cn, shortDate } from '../lib/utils';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  Input,
  KeyValue,
  Panel,
  SectionTitle,
} from '../components/ui';
import { ApiOffline, NoVaultState, PageSkeleton } from '../components/Guards';

export default function Settings() {
  const { vaultId, summary, isLocal, error, refresh } = useVault();
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const [executor, setExecutor] = useState('');
  const [dirtyExecutor, setDirtyExecutor] = useState(false);

  useEffect(() => {
    if (!dirtyExecutor) setExecutor(summary?.executorId ?? '');
  }, [summary?.executorId, dirtyExecutor]);

  const pause = useMutation({
    mutationFn: async (next: boolean) => {
      if (!vaultId) return;
      if (isLocal) {
        await api.localAction(vaultId, { type: next ? 'pause' : 'unpause' });
        return;
      }
      if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
      await wallet.callMethod({
        contractId: vaultId,
        method: next ? 'pause' : 'unpause',
        args: {},
      });
    },
    onSuccess: async (_data, next) => {
      toast.success(next ? 'Vault paused' : 'Vault resumed', next ? 'New agent payments are blocked.' : 'Agents can request payments again.');
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['vault', vaultId] });
    },
    onError: (pauseError) =>
      toast.error('Action failed', pauseError instanceof Error ? pauseError.message : String(pauseError)),
  });

  const saveExecutor = useMutation({
    mutationFn: async () => {
      if (!vaultId) return;
      const value = executor.trim();
      if (value && !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(value)) {
        throw new Error('Executor must be a valid NEAR account id.');
      }
      if (isLocal) {
        await api.setExecutor(vaultId, value || null);
        return;
      }
      if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
      await wallet.callMethod({
        contractId: vaultId,
        method: 'set_executor',
        args: { account_id: value || null },
      });
    },
    onSuccess: async () => {
      setDirtyExecutor(false);
      toast.success('Executor updated', executor.trim() ? `Payouts delegated to ${executor.trim()}.` : 'Cross-chain execution is now disabled.');
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['vault', vaultId] });
    },
    onError: (executorError) =>
      toast.error('Could not update executor', executorError instanceof Error ? executorError.message : String(executorError)),
  });

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;
  if (!summary) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Vault settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Owner-only controls. Every mutation is signed by {isLocal ? 'the simulated owner' : 'your NEAR wallet'};
            this API holds no owner keys.
          </p>
        </div>
        <Badge tone={isLocal ? 'amber' : 'green'} dot>
          {isLocal ? 'simulator' : `${summary.network} contract`}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <Panel className="p-5">
            <SectionTitle
              title="Identity"
              subtitle="Public state read from the vault. Nothing here is secret."
              actions={<CopyButton value={summary.vaultId} label="vault id" />}
            />
            <dl>
              <KeyValue label="Vault id" mono>
                <span className="inline-flex items-center gap-1.5">
                  {summary.vaultId}
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 transition hover:text-slate-200"
                    aria-label="Copy vault id"
                    onClick={() => void navigator.clipboard.writeText(summary.vaultId)}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </span>
              </KeyValue>
              <KeyValue label="Owner">
                <span className="mono inline-flex items-center gap-1.5">
                  {summary.ownerId ?? 'unknown'}
                  {summary.ownerId ? <CopyButton value={summary.ownerId} compact /> : null}
                </span>
              </KeyValue>
              <KeyValue label="Mode">
                <Badge tone={isLocal ? 'amber' : 'green'}>{summary.mode}</Badge>
              </KeyValue>
              <KeyValue label="Network">
                <span className="inline-flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-slate-500" /> {summary.network}
                </span>
              </KeyValue>
              <KeyValue label="Contract version">
                <span className="mono">{summary.contractVersion}</span>
              </KeyValue>
              <KeyValue label="Last indexed">
                <span>{shortDate(summary.updatedAt)}</span>
              </KeyValue>
              {summary.storage ? (
                <KeyValue label="Storage">
                  <span>
                    {amountWithSymbol(summary.storage.spendable, 'NEAR')} spendable ·{' '}
                    {amountWithSymbol(summary.storage.storage_reserve, 'NEAR')} reserved
                  </span>
                </KeyValue>
              ) : null}
            </dl>
          </Panel>

          <Panel className="p-5">
            <SectionTitle
              title="Safety switch"
              subtitle="Pausing blocks new agent payments. Owner withdrawals and approvals of already-approved payouts stay available."
              actions={
                <Badge tone={summary.paused ? 'red' : 'green'} dot>
                  {summary.paused ? 'paused' : 'running'}
                </Badge>
              }
            />
            <div
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4',
                summary.paused
                  ? 'border-rose-200 bg-rose-50'
                  : 'border-green-200 bg-green-50',
              )}
            >
              <div className="flex items-start gap-3">
                {summary.paused ? (
                  <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                ) : (
                  <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {summary.paused ? 'Vault is paused' : 'Vault is accepting requests'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {summary.paused
                      ? 'Agents receive VAULT_PAUSED. Resume when you have reviewed the incident.'
                      : 'All agent requests are evaluated against their policy immediately.'}
                  </p>
                </div>
              </div>
              <Button
                variant={summary.paused ? 'primary' : 'danger'}
                loading={pause.isPending}
                onClick={() => pause.mutate(!summary.paused)}
              >
                {summary.paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                {summary.paused ? 'Resume vault' : 'Pause vault'}
              </Button>
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionTitle
              title="Cross-chain executor"
              subtitle="Delegated account allowed to report settlement for cross-chain payouts. Leave empty to disable delegated execution."
            />
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                saveExecutor.mutate();
              }}
            >
              <Field
                label="Executor account id"
                hint={
                  isLocal
                    ? 'Simulator: the local executor is used automatically when a cross-chain request is approved.'
                    : 'The account running the settlement signer. It can only report results for requests already approved by the owner.'
                }
              >
                <Input
                  value={executor}
                  onChange={(event) => {
                    setExecutor(event.target.value);
                    setDirtyExecutor(true);
                  }}
                  placeholder="executor.agentvault.testnet"
                  spellCheck={false}
                  className="font-mono"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" loading={saveExecutor.isPending} disabled={!dirtyExecutor}>
                  <ShieldCheck className="h-4 w-4" /> Save executor
                </Button>
                {dirtyExecutor ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setExecutor(summary.executorId ?? '');
                      setDirtyExecutor(false);
                    }}
                  >
                    Reset
                  </Button>
                ) : null}
                <span className="text-[11px] text-slate-500">
                  Current: {summary.executorId ?? 'none'}
                </span>
              </div>
            </form>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <KeyRound className="h-4 w-4 text-green-600" /> Key custody model
            </h3>
            <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-400">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green-500" />
                Agents hold their own keys. The vault stores only their public keys and policies.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green-500" />
                The owner key never reaches the API. Owner actions are composed in the browser and
                signed by your wallet.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green-500" />
                The executor can report cross-chain outcomes but cannot create or approve requests.
              </li>
              {isLocal ? (
                <li className="flex gap-2 text-amber-800">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                  Simulator exception: the API generates agent keys server-side so you can drive the
                  demo. This is not part of the real contract flow.
                </li>
              ) : null}
            </ul>
          </Panel>

          <Panel className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <CircleDollarSign className="h-4 w-4 text-green-700" /> Funds and payouts
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Deposits, owner withdrawals and cross-chain funding live on the Funds page. Owner
              withdrawals are always allowed, even while paused.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/app/fund" className="btn text-xs">
                <Wallet className="h-3.5 w-3.5" /> Open funds
              </Link>
              <Link to="/app/security" className="btn text-xs">
                <Repeat className="h-3.5 w-3.5" /> Run red-team suite
              </Link>
            </div>
          </Panel>

          <Panel className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              {isLocal ? (
                <FlaskConical className="h-4 w-4 text-amber-700" />
              ) : (
                <Globe2 className="h-4 w-4 text-green-600" />
              )}
              {isLocal ? 'About this simulator' : 'Cross-chain limitation'}
            </h3>
            {isLocal ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Balances and settlement are simulated in the API process. Restarting the API with a
                fresh database reseeds the demo vault. No chain calls and no funds move.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                The vault tracks cross-chain requests and enforces the same policy, but settlement
                depends on a delegated executor and an external bridge. The contract cannot verify
                destination-chain delivery by itself. See the docs for the exact trust assumptions.
              </p>
            )}
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-850 p-3 text-[11px] leading-relaxed text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
              <span>
                Changing settings emits an event; other open consoles update over server-sent events.
              </span>
            </div>
          </Panel>

          {summary.health === 'degraded' ? (
            <Panel className="border-amber-200 bg-amber-50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Indexer degraded
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-amber-800">
                The API cannot fully read this vault right now. Data shown may be stale. Check RPC
                access for {summary.network}.
              </p>
            </Panel>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> Only the owner can pause, change
          policy, revoke agents or withdraw.
        </span>
        <Link to="/app/vaults" className="inline-flex items-center gap-1 text-green-600 hover:text-green-700">
          Switch vault <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
