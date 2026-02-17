'use client';

import { useState } from 'react';

interface VoteButtonProps {
  intentId: string;
  onVote: (intentId: string, approve: boolean, reason?: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Three voting buttons: For, Against, Abstain.
 *
 * Calls `inv.intent.approve()` or `inv.intent.reject()` through the
 * parent-provided `onVote` callback.
 */
export function VoteButton({ intentId, onVote, disabled }: VoteButtonProps) {
  const [loading, setLoading] = useState<'for' | 'against' | 'abstain' | null>(null);
  const [voted, setVoted] = useState<'for' | 'against' | 'abstain' | null>(null);

  const handleVote = async (choice: 'for' | 'against' | 'abstain') => {
    if (voted || loading) return;
    setLoading(choice);
    try {
      if (choice === 'for') {
        await onVote(intentId, true);
      } else if (choice === 'against') {
        await onVote(intentId, false, 'Voted against');
      } else {
        // Abstain is a rejection without strong reason
        await onVote(intentId, false, 'Abstained');
      }
      setVoted(choice);
    } catch {
      // Keep controls available so the user can retry.
    } finally {
      setLoading(null);
    }
  };

  if (voted) {
    const labels: Record<string, string> = {
      for: 'Voted For',
      against: 'Voted Against',
      abstain: 'Abstained',
    };
    const colors: Record<string, string> = {
      for: 'text-emerald-400',
      against: 'text-red-400',
      abstain: 'text-slate-400',
    };
    return (
      <p className={`text-sm font-medium ${colors[voted]}`}>
        {labels[voted]}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* For */}
      <button
        onClick={() => handleVote('for')}
        disabled={disabled || loading !== null}
        className="rounded-lg bg-emerald-600/20 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-600/40 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading === 'for' ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Voting...
          </span>
        ) : (
          'For'
        )}
      </button>

      {/* Against */}
      <button
        onClick={() => handleVote('against')}
        disabled={disabled || loading !== null}
        className="rounded-lg bg-red-600/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-600/40 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading === 'against' ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Voting...
          </span>
        ) : (
          'Against'
        )}
      </button>

      {/* Abstain */}
      <button
        onClick={() => handleVote('abstain')}
        disabled={disabled || loading !== null}
        className="rounded-lg bg-slate-600/20 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-600/40 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading === 'abstain' ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> ...
          </span>
        ) : (
          'Abstain'
        )}
      </button>
    </div>
  );
}

// ---- tiny spinner ----

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
