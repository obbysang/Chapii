import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "../lib/utils";
import { NETWORK } from "../lib/api";

const LINKS: Array<[string, string]> = [
  ["/", "About"],
  ["/demo", "Live demo"],
  ["/v/avfinal.testnet/security", "Security"],
  ["/v/avfinal.testnet/fund", "Fund"],
];

export default function TopNav({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden bg-[#eef2f7] dark:bg-gray-950">
      <div className={cn("container mx-auto", compact && "max-w-7xl px-4")}>
        <div className="flex items-center justify-between px-4 py-5">
          <div className="flex flex-wrap items-center">
            <Link to="/" className="mr-14 inline-block text-xl font-bold tracking-tight">
              agentvault
            </Link>
            <span className="chip">{NETWORK.toUpperCase()}</span>
          </div>
          <div className="flex flex-wrap items-center">
            <div className="hidden lg:block">
              <ul className="mr-16 flex items-center">
                {LINKS.map(([to, label]) => (
                  <li key={to} className="mr-9 font-medium hover:text-gray-700">
                    <NavLink to={to} className={({ isActive }) => (isActive ? "underline" : "")}>
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hidden lg:block">
              <div className="inline-block">
                <Link
                  to="/new"
                  className="w-full rounded-xl border border-indigo-700 bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 focus:ring focus:ring-indigo-300"
                >
                  Try it free
                </Link>
              </div>
            </div>
            <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>
              {open ? (
                <span className="grid size-12 place-items-center rounded-full bg-indigo-600 text-white"><X className="h-6 w-6" /></span>
              ) : (
                <span className="grid size-12 place-items-center rounded-full bg-indigo-600 text-white"><Menu className="h-6 w-6" /></span>
              )}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-gray-800/80" onClick={() => setOpen(false)} aria-label="Close menu" />
          <nav className="absolute left-0 top-0 h-full w-4/6 max-w-xs overflow-y-auto bg-white px-9 pt-8 sm:max-w-xs">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">agentvault</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <ul className="flex flex-col justify-center py-16">
              {LINKS.map(([to, label]) => (
                <li key={to}>
                  <NavLink to={to} onClick={() => setOpen(false)} className="mb-12 block font-medium hover:text-gray-700">
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <Link to="/new" onClick={() => setOpen(false)} className="block w-full rounded-xl border border-indigo-700 bg-indigo-600 px-5 py-3 text-center font-semibold text-white hover:bg-indigo-700">
              Try it free
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
