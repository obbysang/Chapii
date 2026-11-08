import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  Shield,
  KeyRound,
  FileText,
  Moon,
  Sun,
  ChevronDown,
  ChevronsRight,
  Settings,
  HelpCircle,
  Bell,
  User,
} from "lucide-react";
import { cn } from "../lib/utils";
import { NETWORK } from "../lib/api";
import { useWallet } from "../lib/wallet";

const NAV = [
  { to: "/", label: "Dashboard", Icon: Home },
  { to: "/demo", label: "Live Demo", Icon: Shield, notifs: 27 },
  { to: "/new", label: "Create Vault", Icon: KeyRound },
  { to: "/vaults/all/requests", label: "Requests", Icon: FileText },
  { to: "/v/avfinal.testnet/groups", label: "Groups", Icon: FileText },
];

interface OptionProps {
  Icon: LucideIcon;
  title: string;
  to: string;
  open: boolean;
  notifs?: number | undefined;
}

function Option({ Icon, title, to, open, notifs }: OptionProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative flex h-11 w-full items-center rounded-md transition-all duration-200",
          isActive
            ? "border-l-2 border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-900/50 dark:text-blue-300"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        )
      }
    >
      <div className="grid h-full w-12 shrink-0 place-content-center">
        <Icon className="h-4 w-4" />
      </div>
      {open && <span className="text-sm font-medium">{title}</span>}
      {notifs && open && (
        <span className="absolute right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white dark:bg-blue-600">
          {notifs}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar({
  open,
  setOpen,
  dark,
  setDark,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
}) {
  const { account, connect } = useWallet();
  const [selectedVault] = useState("avfinal.testnet");
  return (
    <nav
      className={cn(
        "sticky top-0 z-10 flex h-screen shrink-0 flex-col border-r border-gray-200 bg-white p-2 shadow-sm transition-all duration-300 dark:border-gray-800 dark:bg-gray-900",
        open ? "w-64" : "w-16"
      )}
      aria-label="Primary"
    >
      <div className="mb-4 border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="flex cursor-pointer items-center justify-between rounded-md p-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-content-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-sm">
              <svg width="20" height="20" viewBox="0 0 50 39" fill="none" xmlns="http://www.w3.org/2000/svg" className="fill-white" aria-hidden>
                <path d="M16.4992 2H37.5808L22.0816 24.9729H1L16.4992 2Z" />
                <path d="M17.4224 27.102L11.4192 36H33.5008L49 13.0271H32.7024L23.2064 27.102H17.4224Z" />
              </svg>
            </div>
            {open && (
              <div>
                <span className="block text-sm font-semibold">agentvault</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{NETWORK.toUpperCase()}</span>
              </div>
            )}
          </div>
          {open && <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />}
        </div>
      </div>

      <div className="mb-6 space-y-1">
        {NAV.map(({ to, label, Icon, notifs }) => (
          <Option key={to + label} Icon={Icon} title={label} to={to} open={open} notifs={notifs} />
        ))}
      </div>

      {open && (
        <div className="space-y-1 border-t border-gray-200 pt-4 dark:border-gray-800">
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Account</div>
          <button
            onClick={connect}
            className="relative flex h-11 w-full items-center rounded-md text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <div className="grid h-full w-12 shrink-0 place-content-center">
              {account ? <User className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </div>
            <span className="text-sm font-medium">{account ? `${account.slice(0, 12)}…` : "Connect wallet"}</span>
          </button>
          <NavLink
            to="/v/avfinal.testnet/settings"
            className="relative flex h-11 w-full items-center rounded-md text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <div className="grid h-full w-12 shrink-0 place-content-center">
              <Settings className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">Settings</span>
          </NavLink>
          <NavLink
            to="/v/avfinal.testnet/security"
            className="relative flex h-11 w-full items-center rounded-md text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <div className="grid h-full w-12 shrink-0 place-content-center">
              <HelpCircle className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">Help &amp; Support</span>
          </NavLink>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-gray-200 px-1 pt-3 dark:border-gray-800">
        <button
          onClick={() => setDark(!dark)}
          className="grid size-10 shrink-0 place-content-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">{selectedVault}</span>
          <button
            onClick={() => setOpen(!open)}
            className="grid size-10 shrink-0 place-content-center rounded-md text-gray-500 transition hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Toggle sidebar"
          >
            <ChevronsRight className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")} />
          </button>
        </div>
      </div>
    </nav>
  );
}
