'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useInvariance } from '@/hooks/useInvariance';
import { DAO_CONFIG } from '@/lib/dao-config';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: DashboardIcon },
  { href: '/proposals', label: 'Proposals', icon: ProposalsIcon },
  { href: '/agents', label: 'Agents', icon: AgentsIcon },
  { href: '/audit', label: 'Audit Log', icon: AuditIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected, address, isConnecting, error, connect } = useInvariance();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/50">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          I
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">Invariance</p>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            AI Governance DAO
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon active={active} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* DAO info */}
      <div className="border-t border-slate-800 px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-600">
          Collective
        </p>
        <p className="text-xs text-slate-400">{DAO_CONFIG.name}</p>
        <p className="mt-0.5 text-[10px] text-slate-600">
          {DAO_CONFIG.members.length} members &middot;{' '}
          {DAO_CONFIG.threshold / 100}% threshold
        </p>
      </div>

      {/* Wallet connect */}
      <div className="border-t border-slate-800 px-4 py-4">
        {isConnected ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="truncate text-xs text-slate-400">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}
            </span>
          </div>
        ) : (
          <>
            <button
              onClick={connect}
              disabled={isConnecting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            {error && (
              <p className="mt-1.5 text-[10px] text-red-400">{error}</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ---- Nav icons (simple SVGs) ----

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-slate-500'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
      />
    </svg>
  );
}

function ProposalsIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-slate-500'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

function AgentsIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-slate-500'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.25-5.682c.251.023.501.05.75.082M5 14.5l-1.703 4.258A1.125 1.125 0 004.348 20h15.303a1.125 1.125 0 001.052-1.242L19 14.5"
      />
    </svg>
  );
}

function AuditIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-slate-500'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
      />
    </svg>
  );
}
