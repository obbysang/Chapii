import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock3,
  Info,
  ShieldCheck,
  Timer,
  UserCheck,
} from 'lucide-react';
import { APPROVAL_WINDOW_MS, timeLeft } from '@agentvault/shared';
import { api } from '../lib/api';
import { useVault } from '../state/vault';
import { useToast } from '../state/toast';
import { useWallet } from '../state/wallet';
import { amountWithSymbol, shortDate, truncateMiddle } from '../lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  RequestStatusBadge,
  SectionTitle,
  Skeleton,
} from '../components/ui';
import { ApiOffline, NoVaultState } from '../components/Guards';

export default function Approvals() {
  const { vaultId, summary, isLocal, error } = useVault();
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const approvalsQuery = useQuery({
    queryKey: ['approvals', vaultId],
    queryFn: () => api.approvals(vaultId as string),
    enabled: Boolean(vaultId),
    refetchInterval: 10_000,
  });

  const action = useMutation({
    mutationFn: async ({ requestId, kind }: { requestId: number; kind: 'approve' | 'reject' }) => {
      if (!vaultId) return;
      if (isLocal) {
        await api.localAction(vaultId, {
          type: kind === 'approve' ? 'approve_request' : 'reject_request',
          requestId,
        });
        return;
      }
      if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
      await wallet.callMethod({
        contractId: vaultId,
        method: kind === 'approve' ? 'approve_request' : 'reject_request',
        args: { request_id: requestId },
      });
    },
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.kind === 'approve' ? 'Approved' : 'Rejected',
        `Request #${variables.requestId} updated by owner.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['approvals', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['requests', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['vault', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['agent', vaultId] }),
      ]);
    },
    onError: (mutationError) =>
      toast.error('Action failed', mutationError instanceof Error ? mutationError.message : String(mutationError)),
  });

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;

  const items = approvalsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Approvals</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Payments above an agent&apos;s co-sign threshold wait here. Approving re-checks the
            policy and the budget at decision time — a stale approval cannot overspend.
          </p>
        </div>
        <Badge tone={items.length > 0 ? 'amber' : 'green'} dot>
          {items.length} waiting
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="flex items-center gap-3 p-4">
          <Clock3 className="h-5 w-5 text-amber-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Approval window</p>
            <p className="text-sm text-slate-200">{Math.round(APPROVAL_WINDOW_MS / 3_600_000)} hours</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <UserCheck className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Signer</p>
            <p className="truncate text-sm text-slate-200">{summary?.ownerId ?? 'owner'}</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <ShieldCheck className="h-5 w-5 text-green-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Mode</p>
            <p className="text-sm text-slate-200">{isLocal ? 'local simulation' : 'owner wallet'}</p>
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionTitle
          title="Owner queue"
          subtitle="Oldest first. Requests expire after the approval window and settle as EXPIRED."
          actions={approvalsQuery.isFetching ? <Badge tone="blue">refreshing</Badge> : null}
        />
        {approvalsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing needs your signature"
            description="When an agent requests an amount above its co-sign threshold, it appears here. The agent cannot bypass this queue."
            icon={<BadgeCheck className="h-5 w-5" />}
            action={
              <Link to="/demo" className="btn text-xs">
                Trigger a co-sign in the demo
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((request) => {
              const expiresAt = new Date(new Date(request.createdAt).getTime() + APPROVAL_WINDOW_MS).toISOString();
              return (
                <div key={request.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">
                          {amountWithSymbol(request.amount, request.asset)}
                        </span>
                        <RequestStatusBadge status={request.status} />
                        <Badge tone="amber">
                          <Timer className="h-3 w-3" /> {timeLeft(expiresAt)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {request.agentName ?? 'agent'} wants to pay{' '}
                        <span className="mono text-slate-300">{truncateMiddle(request.address, 20, 10)}</span>{' '}
                        on {request.chain}
                      </p>
                      {request.memo ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">“{request.memo}”</p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-slate-600">
                        requested {shortDate(request.createdAt)} · client ref {request.clientRef}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        className="text-xs"
                        loading={action.isPending && action.variables?.requestId === request.onchainId && action.variables?.kind === 'approve'}
                        onClick={() => action.mutate({ requestId: request.onchainId, kind: 'approve' })}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        variant="danger"
                        className="text-xs"
                        loading={action.isPending && action.variables?.requestId === request.onchainId && action.variables?.kind === 'reject'}
                        onClick={() => action.mutate({ requestId: request.onchainId, kind: 'reject' })}
                      >
                        <Ban className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Link
                        to={`/app/requests/${request.onchainId}`}
                        className="btn px-2.5 py-1.5 text-xs"
                        aria-label="Open request"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3.5 text-[11px] leading-relaxed text-green-700">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Approval is not a blank cheque. On approve, the contract re-validates the payee, asset,
          per-tx cap, daily cap, rate limit, agent status and vault pause state before moving funds.
          If the budget changed in the meantime, the request fails safely.
        </span>
      </div>
    </div>
  );
}
