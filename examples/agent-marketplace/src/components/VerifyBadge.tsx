'use client';

/**
 * Small verification badge with checkmark icon.
 * Links to the on-chain explorer URL.
 */

interface VerifyBadgeProps {
  txHash: string;
  explorerUrl: string;
}

export default function VerifyBadge({ explorerUrl }: VerifyBadgeProps) {
  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
      title="Verified on Base"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
      Verified
    </a>
  );
}
