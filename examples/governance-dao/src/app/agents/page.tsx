'use client';

import Link from 'next/link';
import { DAO_CONFIG } from '@/lib/dao-config';

function statusBadge(status: string): { bg: string; text: string } {
  switch (status) {
    case 'active':
      return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
    case 'paused':
      return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
    case 'proposed':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400' };
    default:
      return { bg: 'bg-slate-500/20', text: 'text-slate-400' };
  }
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AgentsPage() {
  const agents = DAO_CONFIG.agents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">DAO Agents</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI agents managed by the collective. Each operates under strict policy
          constraints.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const badge = statusBadge(agent.status);
          const spentNum = parseInt(agent.spentUSDC, 10);
          const limitNum = parseInt(agent.limitUSDC, 10);
          const spentPercent = limitNum > 0 ? (spentNum / limitNum) * 100 : 0;

          return (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5 transition hover:border-indigo-500/40 hover:bg-slate-800/80"
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-100">
                  {agent.name}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge.bg} ${badge.text}`}
                >
                  {agent.status}
                </span>
              </div>

              {/* Description */}
              <p className="mb-4 line-clamp-2 text-sm text-slate-400">
                {agent.description}
              </p>

              {/* Spending bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>
                    Spent{' '}
                    <span className="text-slate-300 font-medium">
                      ${agent.spentUSDC}
                    </span>
                  </span>
                  <span>of ${agent.limitUSDC}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      spentPercent > 80
                        ? 'bg-red-500'
                        : spentPercent > 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(spentPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Allowed actions */}
              <div className="mb-3 flex flex-wrap gap-1">
                {agent.allowedActions.map((a) => (
                  <span
                    key={a}
                    className="rounded bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400"
                  >
                    {a}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <p className="text-xs text-slate-600">
                Last active {timeAgo(agent.lastActive)}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
