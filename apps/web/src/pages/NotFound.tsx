import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Compass, Home, ShieldQuestion } from 'lucide-react';
import { PublicHeader } from '../components/Layout';
import { Panel } from '../components/ui';

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
        <Panel className="p-8 text-center sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <ShieldQuestion className="h-7 w-7 text-sky-300" />
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-400/80">
            404 · route not found
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            This address is not in the vault directory
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            Nothing is routed at{' '}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-slate-300">
              {location.pathname}
            </code>
            . Check the link, or head back to the console or the guided demo.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <Link to="/app" className="btn-primary">
              <Compass className="h-4 w-4" /> Open console
            </Link>
            <Link to="/demo" className="btn">
              <ArrowLeft className="h-4 w-4" /> Guided demo
            </Link>
            <Link to="/" className="btn-ghost">
              <Home className="h-4 w-4" /> Landing
            </Link>
          </div>
        </Panel>
      </main>
    </div>
  );
}
