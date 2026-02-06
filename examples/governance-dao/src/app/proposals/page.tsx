'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProposals } from '@/hooks/useProposals';
import { ProposalCard } from '@/components/ProposalCard';
import type { IntentLifecycle } from '@invariance/sdk';

const FILTER_TABS: { label: string; value: IntentLifecycle | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Completed', value: 'completed' },
  { label: 'Rejected', value: 'rejected' },
];

export default function ProposalsPage() {
  const { proposals } = useProposals();
  const [filter, setFilter] = useState<IntentLifecycle | 'all'>('all');

  const filtered =
    filter === 'all'
      ? proposals
      : proposals.filter((p) => p.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Proposals</h1>
          <p className="mt-1 text-sm text-slate-500">
            {proposals.length} total proposals
          </p>
        </div>
        <Link
          href="/proposals/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          New Proposal
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-800/60 p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              filter === tab.value
                ? 'bg-indigo-600/30 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 py-16 text-center">
          <p className="text-sm text-slate-500">
            No proposals match the current filter.
          </p>
        </div>
      )}
    </div>
  );
}
