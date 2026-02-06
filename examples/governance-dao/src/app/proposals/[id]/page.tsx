'use client';

import { use } from 'react';
import Link from 'next/link';
import { useInvariance } from '@/hooks/useInvariance';
import { useProposals } from '@/hooks/useProposals';
import { VoteButton } from '@/components/VoteButton';
import { DAO_CONFIG } from '@/lib/dao-config';

// ---- Helpers ----

function resolveLabel(address: string): string {
  const member = DAO_CONFIG.members.find(
    (m) => m.address.toLowerCase() === address.toLowerCase(),
  );
  return member?.label ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
}

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
    case 'executing':
      return 'bg-indigo-500/20 text-indigo-400';
    default:
      return 'bg-slate-500/20 text-slate-400';
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Page ----

export default function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { inv } = useInvariance();
  const { getProposal, vote, error } = useProposals();

  const proposal = getProposal(id);

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-bold text-slate-100">Proposal not found</h2>
        <p className="mt-2 text-sm text-slate-500">
          Intent ID <code className="text-slate-400">{id}</code> does not exist.
        </p>
        <Link
          href="/proposals"
          className="mt-4 text-sm text-indigo-400 hover:underline"
        >
          Back to proposals
        </Link>
      </div>
    );
  }

  const totalVotes = proposal.votesFor + proposal.votesAgainst;
  const totalMembers = DAO_CONFIG.members.length;
  const forPercent = totalMembers > 0 ? (proposal.votesFor / totalMembers) * 100 : 0;
  const againstPercent = totalMembers > 0 ? (proposal.votesAgainst / totalMembers) * 100 : 0;
  const thresholdPercent = DAO_CONFIG.threshold / 100;

  const handleVote = async (intentId: string, approve: boolean, reason?: string) => {
    if (!inv) return;
    await vote(inv, intentId, approve, reason);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Back link */}
      <Link
        href="/proposals"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
      >
        <span>&larr;</span> All Proposals
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-100">{proposal.title}</h1>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColor(proposal.status)}`}
          >
            {proposal.status}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {proposal.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            Proposed by{' '}
            <span className="text-slate-300">{resolveLabel(proposal.proposer)}</span>
          </span>
          <span>{formatDate(proposal.createdAt)}</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400 capitalize">
            {proposal.action.replaceAll('-', ' ')}
          </span>
        </div>
      </div>

      {/* Vote progress */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Voting Progress
        </h3>

        {/* Bar */}
        <div className="relative mb-2">
          <div className="h-4 w-full rounded-full bg-slate-700 overflow-hidden flex">
            {forPercent > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${forPercent}%` }}
              />
            )}
            {againstPercent > 0 && (
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${againstPercent}%` }}
              />
            )}
          </div>
          {/* Threshold marker */}
          <div
            className="absolute top-0 h-4 w-0.5 bg-amber-400"
            style={{ left: `${thresholdPercent}%` }}
            title={`${thresholdPercent}% threshold`}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            <span className="text-emerald-400 font-medium">{proposal.votesFor}</span>{' '}
            For
          </span>
          <span className="text-amber-400">
            {thresholdPercent}% threshold
          </span>
          <span>
            <span className="text-red-400 font-medium">{proposal.votesAgainst}</span>{' '}
            Against
          </span>
        </div>

        <p className="mt-2 text-xs text-slate-600">
          {totalVotes} of {totalMembers} members voted &middot;{' '}
          Quorum: {DAO_CONFIG.quorum}
        </p>
      </div>

      {/* Vote buttons */}
      {proposal.status === 'pending' && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">
            Cast Your Vote
          </h3>
          <VoteButton intentId={proposal.id} onVote={handleVote} />
          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
        </div>
      )}

      {/* Execute button (for approved proposals) */}
      {proposal.status === 'approved' && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center">
          <p className="mb-3 text-sm text-emerald-400">
            This proposal has been approved and is ready for execution.
          </p>
          <button className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Execute Proposal
          </button>
        </div>
      )}

      {/* Voter list */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Voters</h3>
        {proposal.voters.length > 0 ? (
          <ul className="space-y-2">
            {proposal.voters.map((v) => (
              <li
                key={v.address}
                className="flex items-center justify-between rounded-lg bg-slate-900/40 px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      v.approved ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm text-slate-300">
                    {resolveLabel(v.address)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className={v.approved ? 'text-emerald-400' : 'text-red-400'}>
                    {v.approved ? 'For' : 'Against'}
                  </span>
                  <span>{formatDate(v.timestamp)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No votes yet.</p>
        )}
      </div>

      {/* Parameters */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Proposal Parameters
        </h3>
        <dl className="space-y-2">
          {Object.entries(proposal.params).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg bg-slate-900/40 px-4 py-2"
            >
              <dt className="text-xs text-slate-500 capitalize">
                {key.replace(/([A-Z])/g, ' $1')}
              </dt>
              <dd className="text-sm font-mono text-slate-300">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Timeline</h3>
        <ol className="space-y-3">
          <TimelineItem
            label="Proposal Created"
            timestamp={proposal.createdAt}
            actor={resolveLabel(proposal.proposer)}
          />
          {proposal.voters.map((v, i) => (
            <TimelineItem
              key={i}
              label={v.approved ? 'Voted For' : 'Voted Against'}
              timestamp={v.timestamp}
              actor={resolveLabel(v.address)}
              variant={v.approved ? 'success' : 'error'}
            />
          ))}
          {(proposal.status === 'approved' || proposal.status === 'completed') && (
            <TimelineItem
              label={proposal.status === 'completed' ? 'Executed' : 'Approved'}
              timestamp={
                proposal.voters.length > 0
                  ? proposal.voters[proposal.voters.length - 1].timestamp + 1000
                  : proposal.createdAt + 86_400_000
              }
              actor="System"
              variant="success"
            />
          )}
          {proposal.status === 'rejected' && (
            <TimelineItem
              label="Rejected"
              timestamp={
                proposal.voters.length > 0
                  ? proposal.voters[proposal.voters.length - 1].timestamp + 1000
                  : proposal.createdAt + 86_400_000
              }
              actor="System"
              variant="error"
            />
          )}
        </ol>
      </div>

      {/* Verification link */}
      <div className="text-center">
        <a
          href={`https://sepolia.basescan.org/address/${DAO_CONFIG.daoAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-400 hover:underline"
        >
          View on-chain verification proof
        </a>
      </div>
    </div>
  );
}

// ---- Timeline item ----

function TimelineItem({
  label,
  timestamp,
  actor,
  variant,
}: {
  label: string;
  timestamp: number;
  actor: string;
  variant?: 'success' | 'error';
}) {
  const dotColor =
    variant === 'success'
      ? 'bg-emerald-500'
      : variant === 'error'
        ? 'bg-red-500'
        : 'bg-slate-500';

  return (
    <li className="flex items-start gap-3">
      <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        <p className="text-xs text-slate-500">
          {actor} &middot; {formatDate(timestamp)}
        </p>
      </div>
    </li>
  );
}
