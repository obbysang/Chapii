import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  BookOpen,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  Github,
  LayoutDashboard,
  Menu,
  PlusCircle,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  Vault,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useVault } from '../state/vault';
import { WalletButton } from './WalletButton';
import { CopyButton } from './ui';

export function Logo({ size = 32, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="av-logo" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7dd3fc" />
            <stop offset="0.55" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <path
          d="M20 2.5 35 9v10.2c0 8.3-5.8 15.3-15 18.3-9.2-3-15-10-15-18.3V9L20 2.5Z"
          fill="url(#av-logo)"
          fillOpacity="0.16"
          stroke="url(#av-logo)"
          strokeWidth="1.6"
        />
        <path
          d="M12.5 14.5h15M12.5 20h15M12.5 25.5h9"
          stroke="url(#av-logo)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="27.5" cy="25.5" r="2.2" fill="#34d399" />
      </svg>
      {withWordmark ? (
        <span className="text-[15px] font-semibold tracking-tight text-slate-100">
          Agent<span className="text-sky-400">Vault</span>
        </span>
      ) : null}
    </span>
  );
}

function NavItem({
  to,
  icon,
  label,
  badge,
  end = false,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
          isActive
            ? 'bg-sky-400/10 text-sky-200'
            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
        )
      }
    >
      <span className="text-current opacity-80">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 ? (
        <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-1.5 text-[10px] font-semibold text-amber-300">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        {title}
      </p>
      <nav className="space-y-0.5">{children}</nav>
    </div>
  );
}

function VaultSwitcher() {
  const { vaultId, vaults, summary, setVaultId } = useVault();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
      >
        <Vault className="h-4 w-4 shrink-0 text-sky-400" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-200">
            {summary?.label ?? vaultId ?? 'No vault'}
          </span>
          <span className="block truncate text-[10px] text-slate-500">
            {vaultId ?? 'select a vault'}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close vault menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-ink-900 p-1.5 shadow-card">
            {vaults.map((vault) => (
              <button
                key={vault.vaultId}
                type="button"
                onClick={() => {
                  setVaultId(vault.vaultId);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition',
                  vault.vaultId === vaultId
                    ? 'bg-sky-400/10 text-sky-200'
                    : 'text-slate-300 hover:bg-white/[0.05]',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    vault.mode === 'local' ? 'bg-amber-400' : 'bg-emerald-400',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{vault.label ?? vault.vaultId}</span>
                  <span className="block truncate text-[10px] text-slate-500">{vault.vaultId}</span>
                </span>
              </button>
            ))}
            <NavLink
              to="/app/vaults/new"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-2.5 py-2 text-xs text-slate-400 transition hover:border-sky-400/30 hover:text-sky-200"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Create or register a vault
            </NavLink>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StreamIndicator() {
  const { streamStatus } = useVault();
  const tone =
    streamStatus === 'open'
      ? 'bg-emerald-400'
      : streamStatus === 'connecting'
        ? 'bg-amber-400'
        : 'bg-rose-400';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400"
      title={`Server-sent events: ${streamStatus}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone, streamStatus === 'open' && 'animate-pulse')} />
      {streamStatus === 'open' ? 'Live' : streamStatus === 'connecting' ? 'Connecting' : 'Polling'}
    </span>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { summary } = useVault();
  const pending = summary?.pendingApprovals ?? 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-4 pt-5">
        <NavLink to="/" onClick={onNavigate}>
          <Logo />
        </NavLink>
      </div>
      <div className="px-3">
        <VaultSwitcher />
      </div>

      <div className="mt-5 flex-1 overflow-y-auto px-3 pb-4">
        <NavGroup title="Monitor">
          <NavItem to="/app" end icon={<LayoutDashboard className="h-4 w-4" />} label="Overview" onClick={onNavigate} />
          <NavItem to="/app/agents" icon={<Users className="h-4 w-4" />} label="Agents" onClick={onNavigate} />
          <NavItem to="/app/requests" icon={<Activity className="h-4 w-4" />} label="Requests" onClick={onNavigate} />
          <NavItem
            to="/app/approvals"
            icon={<BadgeCheck className="h-4 w-4" />}
            label="Approvals"
            badge={pending}
            onClick={onNavigate}
          />
        </NavGroup>
        <NavGroup title="Control">
          <NavItem to="/app/fund" icon={<CircleDollarSign className="h-4 w-4" />} label="Funds" onClick={onNavigate} />
          <NavItem to="/app/security" icon={<ShieldAlert className="h-4 w-4" />} label="Red-team suite" onClick={onNavigate} />
          <NavItem to="/app/settings" icon={<Settings className="h-4 w-4" />} label="Vault settings" onClick={onNavigate} />
        </NavGroup>
        <NavGroup title="Workspace">
          <NavItem to="/app/vaults" icon={<Gauge className="h-4 w-4" />} label="All vaults" onClick={onNavigate} />
          <NavItem to="/demo" icon={<ShieldCheck className="h-4 w-4" />} label="Guided demo" onClick={onNavigate} />
        </NavGroup>
      </div>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] p-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-300">AgentVault v1.0.0</p>
            <p className="truncate text-[10px] text-slate-500">MIT · open source</p>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="rounded p-1.5 text-slate-500 transition hover:text-slate-200"
            aria-label="Repository"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href="/docs/README.md"
            className="rounded p-1.5 text-slate-500 transition hover:text-slate-200"
            aria-label="Documentation"
          >
            <BookOpen className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const { summary, health, vaultId, isLocal, error } = useVault();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-[264px] shrink-0 border-r border-white/[0.06] bg-ink-900/60 lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="h-full w-[280px] border-r border-white/10 bg-ink-900">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded p-2 text-slate-400"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
          <button
            type="button"
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-white/10 p-2 text-slate-300 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <span className="truncate text-sm font-medium text-slate-200">
                {summary?.label ?? vaultId ?? 'AgentVault'}
              </span>
              {vaultId ? <CopyButton value={vaultId} compact /> : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {health ? (
                <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400 md:inline-flex">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      health.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400',
                    )}
                  />
                  {health.network} · {health.mode}
                </span>
              ) : null}
              <StreamIndicator />
              <WalletButton />
            </div>
          </div>
          {isLocal ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-amber-400/10 bg-amber-400/[0.05] px-4 py-1.5 text-[11px] text-amber-200/80 sm:px-6">
              <span className="font-semibold uppercase tracking-wide text-amber-300">Simulator</span>
              <span>
                Local deterministic vault. No funds move and no real chain calls are made. Set
                <code className="mx-1 rounded bg-black/30 px-1 py-0.5 font-mono">NEAR_NETWORK=testnet</code>
                and register a deployed contract for the real path.
              </span>
            </div>
          ) : null}
          {error ? (
            <div className="border-t border-rose-400/20 bg-rose-500/[0.07] px-4 py-1.5 text-[11px] text-rose-200 sm:px-6">
              API error: {error.message}
            </div>
          ) : null}
        </header>

        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PublicHeader({ active }: { active?: 'demo' | 'console' }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3.5 sm:px-6">
        <NavLink to="/">
          <Logo />
        </NavLink>
        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          <NavLink
            to="/demo"
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition',
              active === 'demo' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100',
            )}
          >
            Guided demo
          </NavLink>
          <NavLink
            to="/app"
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition',
              active === 'console' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100',
            )}
          >
            Console
          </NavLink>
          <a
            href="/docs/README.md"
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:text-slate-100"
          >
            Docs
          </a>
        </nav>
        <NavLink to="/demo" className="btn-primary ml-auto text-xs sm:ml-2">
          Try the demo
        </NavLink>
      </div>
    </header>
  );
}
