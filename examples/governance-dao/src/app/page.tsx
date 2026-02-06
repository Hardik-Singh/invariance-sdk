'use client';

import { useInvariance } from '@/hooks/useInvariance';
import { useProposals } from '@/hooks/useProposals';
import { TreasuryPanel } from '@/components/TreasuryPanel';
import { ProposalCard } from '@/components/ProposalCard';
import { AuditLog } from '@/components/AuditLog';
import { DAO_CONFIG } from '@/lib/dao-config';
import Link from 'next/link';

export default function DashboardPage() {
  const { inv } = useInvariance();
  const { proposals } = useProposals();

  const activeProposals = proposals.filter((p) => p.status === 'pending');
  const activeAgents = DAO_CONFIG.agents.filter((a) => a.status === 'active');

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of the {DAO_CONFIG.name}
        </p>
      </div>

      {/* Top row: Treasury + Stats */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TreasuryPanel inv={inv} />
        </div>

        {/* Stat cards */}
        <div className="flex flex-col gap-4">
          <StatCard
            label="Active Proposals"
            value={String(activeProposals.length)}
            accent="indigo"
            href="/proposals"
          />
          <StatCard
            label="Active Agents"
            value={String(activeAgents.length)}
            accent="emerald"
            href="/agents"
          />
          <StatCard
            label="DAO Members"
            value={String(DAO_CONFIG.members.length)}
            accent="amber"
          />
        </div>
      </div>

      {/* Middle: Recent proposals */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">
            Recent Proposals
          </h2>
          <Link
            href="/proposals"
            className="text-xs text-indigo-400 hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {proposals.slice(0, 4).map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      </section>

      {/* Bottom: Audit trail */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">
            Recent Activity
          </h2>
          <Link
            href="/audit"
            className="text-xs text-indigo-400 hover:underline"
          >
            Full log
          </Link>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
          <AuditLog inv={inv} compact />
        </div>
      </section>
    </div>
  );
}

// ---- helpers ----

function StatCard({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string;
  accent: 'indigo' | 'emerald' | 'amber';
  href?: string;
}) {
  const border = {
    indigo: 'border-indigo-500/30',
    emerald: 'border-emerald-500/30',
    amber: 'border-amber-500/30',
  }[accent];
  const text = {
    indigo: 'text-indigo-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  }[accent];

  const card = (
    <div
      className={`rounded-xl border bg-slate-800/60 p-5 transition ${border} ${href ? 'hover:bg-slate-800/80 cursor-pointer' : ''}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-bold ${text}`}>{value}</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}
