import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REASON_MESSAGES, explorerTx } from '@agentvault/shared';
import type { RequestStatus } from '@agentvault/shared';
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Fingerprint,
  Globe2,
  Hash,
  Info,
  ShieldCheck,
  Timer,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useVault } from '../state/vault';
import { useToast } from '../state/toast';
import { useWallet } from '../state/wallet';
import {
  amountWithSymbol,
  copyText,
  isRejection,
  shortDate,
  truncateMiddle,
} from '../lib/utils';
import {
  Badge,
  Button,
  KeyValue,
  Panel,
  ReasonBadge,
  RequestStatusBadge,
  SectionTitle,
} from '../components/ui';
import { RequestTable } from '../components/RequestTable';
import { NoVaultState, PageSkeleton } from '../components/Guards';

const STATUS_ORDER: RequestStatus[] = [
  'PENDING_APPROVAL',
  'APPROVED',
  'AWAITING_EXECUTION',
  'EXECUTING',
  'COMPLETED',
];

function Timeline({
  status,
  createdAt,
  decidedAt,
  settledAt,
  crosschain,
}: {
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  settledAt: string | null;
  crosschain: boolean;
}) {
  const reached = (step: 'created' | 'decision' | 'payout' | 'settled') => {
    const index = STATUS_ORDER.indexOf(status);
    if (step === 'created') return true;
    if (step === 'decision') return index >= 1 || isRejection(status) || status === 'PENDING_APPROVAL';
    if (step === 'payout') return crosschain && index >= 2;
    return status === 'COMPLETED';
  };
  const steps = [
    { id: 'created' as const, title: 'Requested', detail: shortDate(createdAt), icon: Hash },
    {
      id: 'decision' as const,
      title: status === 'PENDING_APPROVAL' ? 'Waiting for owner' : isRejection(status) ? 'Rejected' : 'Approved by policy',
      detail: decidedAt ? shortDate(decidedAt) : status === 'PENDING_APPROVAL' ? 'co-sign required' : '—',
      icon: status === 'PENDING_APPROVAL' ? Clock3 : isRejection(status) ? Ban : CheckCircle2,
    },
    ...(crosschain
      ? [
          {
            id: 'payout' as const,
            title: 'Cross-chain payout',
            detail: ['AWAITING_EXECUTION', 'EXECUTING'].includes(status) ? 'in progress' : 'deposit submitted',
            icon: Globe2,
          },
        ]
      : []),
    {
      id: 'settled' as const,
      title: status === 'FAILED' ? 'Failed' : status === 'REJECTED_BY_OWNER' ? 'Owner rejected' : 'Settled',
      detail: settledAt ? shortDate(settledAt) : status === 'COMPLETED' ? 'final' : 'not yet',
      icon: status === 'FAILED' || status === 'REJECTED_BY_OWNER' ? XCircle : ShieldCheck,
    },
  ];

  return (
    <ol className="relative space-y-4 border-l border-white/[0.08] pl-5">
      {steps.map((step) => {
        const done = reached(step.id);
        const Icon = step.icon;
        return (
          <li key={step.id} className="relative">
            <span
              className={`absolute -left-[30px] flex h-5 w-5 items-center justify-center rounded-full border ${
                done
                  ? 'border-sky-400/40 bg-sky-400/15 text-sky-300'
                  : 'border-white/10 bg-ink-950 text-slate-600'
              }`}
            >
              <Icon className="h-2.5 w-2.5" />
            </span>
            <p className={done ? 'text-xs font-medium text-slate-200' : 'text-xs font-medium text-slate-500'}>
              {step.title}
            </p>
            <p className="text-[10px] text-slate-600">{step.detail}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function RequestDetail() {
  const { id = '' } = useParams();
  const numeric = Number(id);
  const { vaultId, summary, isLocal, health } = useVault();
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [showRaw, setShowRaw] = useState(false);

  const requestQuery = useQuery({
    queryKey: ['request', vaultId, numeric],
    queryFn: () => api.request(vaultId as string, numeric),
    enabled: Boolean(vaultId) && Number.isInteger(numeric) && numeric > 0,
    refetchInterval: (query) => {
      const data = query.state.data as { status?: string } | undefined;
      if (!data) return 2000;
      return ['PENDING_APPROVAL', 'AWAITING_EXECUTION', 'EXECUTING'].includes(data.status ?? '')
        ? 2000
        : false;
    },
    retry: 1,
  });

  const recentQuery = useQuery({
    queryKey: ['requests', vaultId, { agent: requestQuery.data?.agentPublicKey, limit: 5 }],
    queryFn: () =>
      api.requests(vaultId as string, { agent: requestQuery.data?.agentPublicKey, limit: 5 }),
    enabled: Boolean(vaultId && requestQuery.data?.agentPublicKey),
  });

  const action = useMutation({
    mutationFn: async (kind: 'approve' | 'reject') => {
      if (!vaultId) return;
      const method = kind === 'approve' ? 'approve_request' : 'reject_request';
      if (isLocal) {
        await api.localAction(vaultId, {
          type: kind === 'approve' ? 'approve_request' : 'reject_request',
          requestId: numeric,
        });
        return;
      }
      if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
      await wallet.callMethod({
        contractId: vaultId,
        method,
        args: { request_id: numeric },
      });
    },
    onSuccess: async (_data, kind) => {
      toast.success(kind === 'approve' ? 'Request approved' : 'Request rejected', `#${numeric}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['request', vaultId, numeric] }),
        queryClient.invalidateQueries({ queryKey: ['requests', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['approvals', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['vault', vaultId] }),
      ]);
    },
    onError: (error) =>
      toast.error('Owner action failed', error instanceof Error ? error.message : String(error)),
  });

  if (!vaultId) return <NoVaultState />;
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return (
      <Panel className="p-6">
        <p className="text-sm text-slate-300">Invalid request id.</p>
        <Link to="/app/requests" className="btn mt-4 text-xs">Back to requests</Link>
      </Panel>
    );
  }
  if (requestQuery.isLoading) return <PageSkeleton />;
  if (requestQuery.error || !requestQuery.data) {
    return (
      <div className="space-y-4">
        <Link to="/app/requests" className="btn text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Requests
        </Link>
        <Panel className="p-6">
          <p className="text-sm text-slate-300">
            Request #{numeric} was not found in this vault.
          </p>
        </Panel>
      </div>
    );
  }

  const request = requestQuery.data;
  const reasonInfo = request.reason ? REASON_MESSAGES[request.reason] : null;
  const crosschain = Boolean(request.depositAddress || request.settlementRef || request.chain !== 'near');
  const simulated = request.depositAddress?.startsWith('sim-local-') ?? false;
  const txUrl = request.txHash && health ? explorerTx(health.network, request.txHash) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/requests" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Requests
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                Request #{request.onchainId}
              </h1>
              <RequestStatusBadge status={request.status} />
              {simulated ? <Badge tone="amber">simulated payout</Badge> : null}
              {request.verification !== 'UNVERIFIED' ? (
                <Badge tone={request.verification === 'OK' ? 'green' : 'red'}>
                  settlement {request.verification.toLowerCase()}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-slate-400">
              {amountWithSymbol(request.amount, request.asset)} to{' '}
              <span className="mono text-slate-300">{truncateMiddle(request.address, 16, 8)}</span>
            </p>
          </div>
          {request.status === 'PENDING_APPROVAL' ? (
            <div className="flex gap-2">
              <Button
                variant="primary"
                loading={action.isPending && action.variables === 'approve'}
                onClick={() => action.mutate('approve')}
              >
                <CheckCircle2 className="h-4 w-4" /> Approve as owner
              </Button>
              <Button
                variant="danger"
                loading={action.isPending && action.variables === 'reject'}
                onClick={() => action.mutate('reject')}
              >
                <Ban className="h-4 w-4" /> Reject
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {request.reason && reasonInfo ? (
        <div
          className={`rounded-xl border p-4 ${
            request.reason === 'TRANSFER_FAILED'
              ? 'border-amber-400/25 bg-amber-400/[0.06]'
              : 'border-rose-400/25 bg-rose-400/[0.06]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Ban className={request.reason === 'TRANSFER_FAILED' ? 'h-4 w-4 text-amber-300' : 'h-4 w-4 text-rose-300'} />
            <p className={`text-sm font-semibold ${request.reason === 'TRANSFER_FAILED' ? 'text-amber-200' : 'text-rose-200'}`}>
              {reasonInfo.label}
            </p>
            <ReasonBadge reason={request.reason} />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">{reasonInfo.message}</p>
          <p className="mt-1 text-[11px] text-slate-500">Agent guidance: {reasonInfo.hint}</p>
        </div>
      ) : request.status === 'PENDING_APPROVAL' ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-amber-300" />
            <p className="text-sm font-semibold text-amber-200">Waiting for owner co-sign</p>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            The policy allows the payee and the amount, but this request is above the co-sign
            threshold. Nothing will move until the owner approves it.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            <p className="text-sm font-semibold text-emerald-200">
              {request.status === 'COMPLETED' ? 'Settled within policy' : 'Approved within policy'}
            </p>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            The request passed validation, allowlist, caps and rate limits. The vault recorded the
            spend against the daily counter.
          </p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle title="Payment details" />
            <dl>
              <KeyValue label="Amount">
                <span className="font-medium">{amountWithSymbol(request.amount, request.asset)}</span>
              </KeyValue>
              <KeyValue label="Asset">
                <span className="mono">{request.asset}</span>
              </KeyValue>
              <KeyValue label="Recipient">
                <span className="mono break-all">{request.address}</span>
              </KeyValue>
              <KeyValue label="Chain">{request.chain}</KeyValue>
              <KeyValue label="Destination asset">{request.destAsset ?? '—'}</KeyValue>
              <KeyValue label="Client ref">
                <span className="mono">{request.clientRef}</span>
              </KeyValue>
              <KeyValue label="Memo">{request.memo ?? '—'}</KeyValue>
              <KeyValue label="Agent">
                {request.agentName ? (
                  <Link
                    to={`/app/agents/${encodeURIComponent(request.agentPublicKey)}`}
                    className="text-sky-300 hover:text-sky-200"
                  >
                    {request.agentName}
                  </Link>
                ) : (
                  <span className="mono">{truncateMiddle(request.agentPublicKey, 12, 8)}</span>
                )}
              </KeyValue>
              <KeyValue label="Created">{shortDate(request.createdAt)}</KeyValue>
              <KeyValue label="Decided">{shortDate(request.decidedAt)}</KeyValue>
            </dl>
          </Panel>

          {crosschain ? (
            <Panel className="p-5">
              <SectionTitle
                title="Cross-chain settlement"
                actions={simulated ? <Badge tone="amber">local simulation</Badge> : <Badge tone="violet">NEAR Intents</Badge>}
              />
              <dl>
                <KeyValue label="Deposit address">
                  <span className="mono break-all">{request.depositAddress ?? 'not assigned yet'}</span>
                </KeyValue>
                <KeyValue label="Settlement ref">
                  <span className="mono break-all">{request.settlementRef ?? 'pending'}</span>
                </KeyValue>
                <KeyValue label="Job state">{request.jobState ?? 'not queued'}</KeyValue>
                <KeyValue label="Verification">
                  <Badge tone={request.verification === 'OK' ? 'green' : request.verification === 'MISMATCH' ? 'red' : 'slate'}>
                    {request.verification.toLowerCase()}
                  </Badge>
                </KeyValue>
              </dl>
              {simulated ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] text-amber-200">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This deposit address begins with <code className="font-mono">sim-local-</code> and
                    exists only in the demo. No value can be sent to it.
                  </span>
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] text-slate-500">
                  <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                  <span>
                    Cross-chain delivery is performed by NEAR Intents solvers, not by the vault
                    contract. The contract enforces the policy and records the reference; it does
                    not prove destination-chain finality.
                  </span>
                </div>
              )}
            </Panel>
          ) : null}

          <Panel className="p-5">
            <SectionTitle
              title="Raw receipt"
              actions={
                <Button variant="ghost" className="text-xs" onClick={() => setShowRaw((value) => !value)}>
                  {showRaw ? 'Hide' : 'Show JSON'}
                </Button>
              }
            />
            {showRaw ? (
              <pre className="max-h-80 overflow-auto rounded-lg border border-white/[0.07] bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
{JSON.stringify(request, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-slate-500">
                The read model stores the chain fields without altering amounts. Use the JSON view
                when comparing against the contract.
              </p>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle title="Timeline" />
            <Timeline
              status={request.status}
              createdAt={request.createdAt}
              decidedAt={request.decidedAt}
              settledAt={request.status === 'COMPLETED' ? request.decidedAt : null}
              crosschain={crosschain}
            />
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Proof" />
            <dl>
              <KeyValue label="Request id" mono>
                #{request.onchainId}
              </KeyValue>
              <KeyValue label="Tx hash">
                {request.txHash ? (
                  txUrl ? (
                    <a href={txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200">
                      <span className="mono">{truncateMiddle(request.txHash, 12, 8)}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="mono">{truncateMiddle(request.txHash, 12, 8)}</span>
                  )
                ) : (
                  'local simulator · no tx'
                )}
              </KeyValue>
              <KeyValue label="Fingerprint" mono>
                {request.id}
              </KeyValue>
            </dl>
            <div className="mt-3 flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 text-xs"
                onClick={() =>
                  void copyText(
                    JSON.stringify({ request: request.onchainId, status: request.status, reason: request.reason }),
                  ).then((ok) => ok && toast.success('Receipt summary copied'))
                }
              >
                <Copy className="h-3.5 w-3.5" /> Copy summary
              </Button>
              {txUrl ? (
                <a href={txUrl} target="_blank" rel="noreferrer" className="btn flex-1 text-xs">
                  Explorer <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Pipeline" />
            <div className="space-y-2 text-[11px]">
              {[
                { label: 'Vault paused', value: summary?.paused ? 'yes' : 'no' },
                { label: 'Agent', value: request.agentName ?? truncateMiddle(request.agentPublicKey, 8, 6) },
                { label: 'Mode', value: summary?.mode ?? '—' },
                { label: 'Network', value: summary?.network ?? '—' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-slate-500">{row.label}</span>
                  <span className="text-slate-300">{row.value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="p-5">
        <SectionTitle
          title="More from this agent"
          actions={
            request.agentName ? (
              <Link to={`/app/agents/${encodeURIComponent(request.agentPublicKey)}`} className="text-xs text-sky-300 hover:text-sky-200">
                Open agent
              </Link>
            ) : null
          }
        />
        <RequestTable
          requests={recentQuery.data?.items ?? []}
          vaultId={vaultId}
          showAgent={false}
          empty={<p className="text-xs text-slate-500">No other requests.</p>}
        />
      </Panel>

      <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-[11px] text-slate-500">
        <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          The contract is the source of truth. This page renders the API read model, which replays
          contract changes into Postgres. If they disagree, trust the chain.
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-600">
        <Timer className="h-3.5 w-3.5" />
        {['PENDING_APPROVAL', 'AWAITING_EXECUTION', 'EXECUTING'].includes(request.status)
          ? 'This page polls while the request is in flight.'
          : `Final state recorded ${shortDate(request.decidedAt)}.`}
      </div>

      {request.status === 'PENDING_APPROVAL' && !isLocal ? (
        <div className="flex items-start gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] p-3.5 text-[11px] text-sky-200">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Real vault: approval is an owner-signed transaction. Connect your wallet to sign it; this
          page never sees the key.
        </div>
      ) : null}
    </div>
  );
}
