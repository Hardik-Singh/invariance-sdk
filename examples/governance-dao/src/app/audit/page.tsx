'use client';

import { useState } from 'react';
import { useInvariance } from '@/hooks/useInvariance';
import { AuditLog } from '@/components/AuditLog';

const ACTION_FILTERS = [
  { value: '', label: 'All Actions' },
  { value: 'proposal-created', label: 'Proposal Created' },
  { value: 'vote-cast', label: 'Vote Cast' },
  { value: 'agent-deployed', label: 'Agent Deployed' },
  { value: 'policy-evaluated', label: 'Policy Evaluated' },
  { value: 'escrow-funded', label: 'Escrow Funded' },
  { value: 'transfer', label: 'Transfer' },
] as const;

export default function AuditPage() {
  const { inv } = useInvariance();
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const filters: { actor?: string; action?: string; limit: number } = {
    limit: 50,
  };
  if (actorFilter.trim()) {
    filters.actor = actorFilter.trim();
  }
  if (actionFilter) {
    filters.action = actionFilter;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Immutable, on-chain record of every action taken by the DAO and its
          agents.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
        {/* Actor filter */}
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="actor"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500"
          >
            Filter by actor
          </label>
          <input
            id="actor"
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="0x... or name"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-indigo-500"
          />
        </div>

        {/* Action filter */}
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="action-filter"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500"
          >
            Filter by action
          </label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
          >
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Log */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <AuditLog inv={inv} filters={filters} />
      </div>

      {/* Export hint */}
      <p className="text-center text-xs text-slate-600">
        All entries are anchored on-chain via the Invariance Execution Log
        contract. Transaction hashes link to Base Sepolia explorer.
      </p>
    </div>
  );
}
