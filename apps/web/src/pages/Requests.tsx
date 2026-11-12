import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Ban, CheckCircle2, Filter, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { REQUEST_STATUSES } from '@agentvault/shared';
import { api } from '../lib/api';
import { useVault } from '../state/vault';
import { cn } from '../lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Panel,
  SectionTitle,
  Select,
  Skeleton,
} from '../components/ui';
import { RequestTable } from '../components/RequestTable';
import { ApiOffline, NoVaultState } from '../components/Guards';

const FILTER_KEY = 'agentvault.requests.filters';

export default function Requests() {
  const { vaultId, summary, error } = useVault();
  const [status, setStatus] = useState('');
  const [agent, setAgent] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');

  const agentsQuery = useQuery({
    queryKey: ['agents', vaultId],
    queryFn: () => api.agents(vaultId as string),
    enabled: Boolean(vaultId),
  });

  const filters = useMemo(
    () => ({
      status: status || undefined,
      agent: agent || undefined,
      q: appliedQ || undefined,
    }),
    [status, agent, appliedQ],
  );

  const requestsQuery = useInfiniteQuery({
    queryKey: ['requests', vaultId, filters],
    queryFn: ({ pageParam }) =>
      api.requests(vaultId as string, {
        ...filters,
        limit: 25,
        cursor: pageParam as number | undefined,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(vaultId),
  });

  const requests = requestsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const activeFilters = Boolean(status || agent || appliedQ);

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;

  const reset = () => {
    setStatus('');
    setAgent('');
    setQ('');
    setAppliedQ('');
    localStorage.removeItem(FILTER_KEY);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Requests</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Every call to request_payment leaves a receipt, including rejected ones. Filter by
            outcome, agent, address or memo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="green">
            <CheckCircle2 className="h-3 w-3" /> {summary?.stats24h.approved ?? 0} approved / 24h
          </Badge>
          <Badge tone="red">
            <Ban className="h-3 w-3" /> {summary?.stats24h.rejected ?? 0} blocked / 24h
          </Badge>
        </div>
      </div>

      <Panel className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_200px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setAppliedQ(q.trim());
              }}
              placeholder="Search address, memo or client ref"
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status filter">
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll('_', ' ').toLowerCase()}
              </option>
            ))}
          </Select>
          <Select value={agent} onChange={(event) => setAgent(event.target.value)} aria-label="Agent filter">
            <option value="">All agents</option>
            {(agentsQuery.data?.items ?? summary?.agents ?? []).map((item) => (
              <option key={item.publicKey} value={item.publicKey}>
                {item.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setAppliedQ(q.trim())}>
              <Filter className="h-4 w-4" /> Apply
            </Button>
            {activeFilters ? (
              <Button variant="ghost" onClick={reset} aria-label="Reset filters">
                <RotateCcw className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionTitle
          title="Ledger"
          subtitle={
            requestsQuery.isLoading
              ? 'Loading receipts…'
              : `${requests.length} receipt(s)${activeFilters ? ' matching filters' : ''}`
          }
          actions={
            <span className={cn('text-[11px]', requestsQuery.isError ? 'text-rose-300' : 'text-slate-500')}>
              {requestsQuery.isError ? 'Could not load requests' : 'newest first'}
            </span>
          }
        />
        {requestsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : (
          <>
            <RequestTable
              requests={requests}
              vaultId={vaultId}
              empty={
                <EmptyState
                  title={activeFilters ? 'No matching receipts' : 'No receipts yet'}
                  description={
                    activeFilters
                      ? 'Try a different status, agent or search term.'
                      : 'Create an agent and run the guided demo to produce the first decision.'
                  }
                  icon={<ShieldCheck className="h-5 w-5" />}
                  action={
                    activeFilters ? (
                      <Button variant="ghost" onClick={reset}>
                        Clear filters
                      </Button>
                    ) : (
                      <Link to="/demo" className="btn text-xs">
                        Open guided demo
                      </Link>
                    )
                  }
                />
              }
            />
            {requestsQuery.hasNextPage ? (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="ghost"
                  loading={requestsQuery.isFetchingNextPage}
                  onClick={() => void requestsQuery.fetchNextPage()}
                >
                  Load older receipts
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <p className="px-1 text-[11px] leading-relaxed text-slate-500">
        Rows come from the API&apos;s read model, which is backed by the chain. Local mode uses the
        deterministic simulator. In NEAR mode the indexer advances with <code className="rounded bg-white/[0.05] px-1 font-mono">get_changes_since</code>.
      </p>
    </div>
  );
}
