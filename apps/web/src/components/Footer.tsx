import { Link } from 'react-router-dom';
import { Logo } from './Layout';

export function Footer() {
  return (
    <footer className="border-t border-ink-700 bg-mist">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Policy-enforced treasury for AI agents on NEAR. The contract decides. Every payment
            leaves a receipt.
          </p>
          <p className="mt-4 text-[11px] text-slate-600">
            MIT licensed. Local demo mode is a deterministic simulator, not a blockchain.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Product
            </p>
            <ul className="space-y-1.5 text-slate-400">
              <li><Link className="hover:text-slate-200" to="/demo">Guided demo</Link></li>
              <li><Link className="hover:text-slate-200" to="/app">Console</Link></li>
              <li><Link className="hover:text-slate-200" to="/app/security">Red-team suite</Link></li>
              <li><Link className="hover:text-slate-200" to="/app/vaults/new">Create a vault</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Engineering
            </p>
            <ul className="space-y-1.5 text-slate-400">
              <li><a className="hover:text-slate-200" href="/docs/architecture.md">Architecture</a></li>
              <li><a className="hover:text-slate-200" href="/docs/threat-model.md">Threat model</a></li>
              <li><a className="hover:text-slate-200" href="/docs/api.md">API reference</a></li>
              <li><a className="hover:text-slate-200" href="/docs/DECISIONS.md">Decisions</a></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Integrations
            </p>
            <ul className="space-y-1.5 text-slate-400">
              <li><a className="hover:text-slate-200" href="/docs/mcp.md">MCP server</a></li>
              <li><a className="hover:text-slate-200" href="/docs/sdk.md">TypeScript SDK</a></li>
              <li><a className="hover:text-slate-200" href="/docs/limitations.md">Limitations</a></li>
              <li><a className="hover:text-slate-200" href="/llms.txt">llms.txt</a></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
