import { Link } from 'react-router-dom';
import { AlertTriangle, PlusCircle, ServerCrash } from 'lucide-react';
import { Panel, Skeleton } from './ui';

export function ApiOffline({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Panel className="p-8 text-center">
        <ServerCrash className="mx-auto h-8 w-8 text-rose-300" />
        <h1 className="mt-3 text-lg font-semibold text-slate-100">API unreachable</h1>
        <p className="mt-2 text-sm text-slate-400">
          {message ?? 'The browser cannot reach the AgentVault API.'}
        </p>
        <div className="mt-5 rounded-lg border border-white/10 bg-ink-950/60 p-3 text-left">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Start the stack</p>
          <pre className="mt-1 font-mono text-xs text-slate-300">docker compose up --build</pre>
          <p className="mt-2 text-[11px] text-slate-500">
            Or run the API locally: <code className="font-mono">pnpm --filter @agentvault/api dev</code>
          </p>
        </div>
      </Panel>
    </div>
  );
}

export function NoVaultState() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Panel className="p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" />
        <h1 className="mt-3 text-lg font-semibold text-slate-100">No vault selected</h1>
        <p className="mt-2 text-sm text-slate-400">
          Create a local demo vault or register a deployed AgentVault contract to get started.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/app/vaults/new" className="btn-primary">
            <PlusCircle className="h-4 w-4" /> Create a vault
          </Link>
          <Link to="/app/vaults" className="btn">
            All vaults
          </Link>
        </div>
      </Panel>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
