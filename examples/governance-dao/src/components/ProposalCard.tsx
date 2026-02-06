'use client';

import Link from 'next/link';
import type { Proposal } from '@/hooks/useProposals';
import { DAO_CONFIG } from '@/lib/dao-config';

// ---- Helpers ----

function statusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/20 text-amber-400';
    case 'approved':
      return 'bg-blue-500/20 text-blue-400';
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'rejected':
      return 'bg-red-500/20 text-red-400';
    case 'expired':
      return 'bg-gray-500/20 text-gray-400';
    case 'executing':
      return 'bg-indigo-500/20 text-indigo-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
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

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function resolveLabel(address: string): string {
  const member = DAO_CONFIG.members.find(
    (m) => m.address.toLowerCase() === address.toLowerCase(),
  );
  return member?.label ?? truncateAddress(address);
}

// ---- Component ----

interface ProposalCardProps {
  proposal: Proposal;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const totalVotes = proposal.votesFor + proposal.votesAgainst;
  const forPercent = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0;

  return (
    <Link
      href={`/proposals/${proposal.id}`}
      className="block rounded-xl border border-slate-700/50 bg-slate-800/60 p-5 transition hover:border-indigo-500/40 hover:bg-slate-800/80"
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-100 leading-snug">
          {proposal.title}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor(proposal.status)}`}
        >
          {proposal.status}
        </span>
      </div>

      {/* Description snippet */}
      <p className="mb-4 line-clamp-2 text-sm text-slate-400">
        {proposal.description}
      </p>

      {/* Vote bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span className="text-emerald-400">{proposal.votesFor} For</span>
          <span className="text-red-400">{proposal.votesAgainst} Against</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
          {totalVotes > 0 && (
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
              style={{ width: `${forPercent}%` }}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Proposed by{' '}
          <span className="text-slate-300">{resolveLabel(proposal.proposer)}</span>
        </span>
        <span>{timeAgo(proposal.createdAt)}</span>
      </div>
    </Link>
  );
}
