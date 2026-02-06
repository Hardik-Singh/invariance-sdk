'use client';

/**
 * Status badge for an escrow contract.
 *
 * Colors per state:
 *   created  -> gray
 *   funded   -> blue
 *   released -> green
 *   refunded -> amber
 *   disputed -> red
 *   expired  -> gray
 */
import type { EscrowState } from '@invariance/sdk';

interface EscrowStatusProps {
  state: EscrowState;
  amount: string;
  createdAt?: number;
}

const STATE_STYLES: Record<EscrowState, { bg: string; text: string; dot: string; label: string }> = {
  created: {
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-700',
    dot: 'bg-gray-400',
    label: 'Created',
  },
  funded: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
    label: 'Funded',
  },
  released: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    label: 'Released',
  },
  refunded: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    label: 'Refunded',
  },
  disputed: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
    label: 'Disputed',
  },
  expired: {
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-500',
    dot: 'bg-gray-400',
    label: 'Expired',
  },
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function EscrowStatus({ state, amount, createdAt }: EscrowStatusProps) {
  const style = STATE_STYLES[state];

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${style.bg}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
      <span className="text-sm text-gray-500">|</span>
      <span className="text-sm font-semibold text-gray-800">${amount} USDC</span>
      {createdAt && (
        <>
          <span className="text-sm text-gray-500">|</span>
          <span className="text-xs text-gray-400">{formatRelativeTime(createdAt)}</span>
        </>
      )}
    </div>
  );
}
