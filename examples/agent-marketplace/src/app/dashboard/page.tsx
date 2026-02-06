'use client';

/**
 * User dashboard page.
 *
 * - Active hires with escrow status
 * - Completed hires with review option
 * - Transaction history
 */
import { useState } from 'react';
import Link from 'next/link';
import { useInvariance } from '@/hooks/useInvariance';
import EscrowStatus from '@/components/EscrowStatus';
import ReviewForm from '@/components/ReviewForm';
import type { ReviewPayload } from '@/components/ReviewForm';
import { DEMO_HIRES } from '@/lib/constants';
import type { DemoHire } from '@/lib/constants';

export default function DashboardPage() {
  const { isConnected, address, inv } = useInvariance();
  const [reviewingHire, setReviewingHire] = useState<string | null>(null);

  const activeHires = DEMO_HIRES.filter(
    (h) => h.escrowState === 'funded' || h.escrowState === 'created',
  );
  const completedHires = DEMO_HIRES.filter(
    (h) => h.escrowState === 'released' || h.escrowState === 'refunded',
  );

  async function handleReviewSubmit(review: ReviewPayload) {
    try {
      await inv.marketplace.complete(review.hireId, {
        review: {
          rating: review.rating,
          comment: review.comment,
          categories: review.categories,
        },
      });
    } catch {
      // SDK throws TODO
    }
    setReviewingHire(null);
  }

  // ------------------------------------------------------------------
  // Not connected state
  // ------------------------------------------------------------------
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
          <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-gray-900">Connect Your Wallet</h2>
        <p className="mt-2 text-gray-500">
          Connect your wallet to view your hires, escrows, and transaction history.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">{address}</p>
        </div>
        <Link
          href="/register"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          Register Agent
        </Link>
      </div>

      {/* ================================================================ */}
      {/* Active hires */}
      {/* ================================================================ */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Active Hires</h2>
        {activeHires.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No active hires.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {activeHires.map((hire) => (
              <HireCard key={hire.hireId} hire={hire} />
            ))}
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* Completed hires */}
      {/* ================================================================ */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">Completed Hires</h2>
        {completedHires.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No completed hires yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {completedHires.map((hire) => (
              <div key={hire.hireId}>
                <HireCard hire={hire}>
                  {reviewingHire === hire.hireId ? (
                    <div className="mt-4">
                      <ReviewForm hireId={hire.hireId} onSubmit={handleReviewSubmit} />
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingHire(hire.hireId)}
                      className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Leave a Review
                    </button>
                  )}
                </HireCard>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* Transaction history */}
      {/* ================================================================ */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {DEMO_HIRES.map((hire) => (
                <tr key={hire.hireId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">Escrow</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {hire.listing.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">${hire.amount} USDC</td>
                  <td className="px-4 py-3">
                    <EscrowStatus state={hire.escrowState} amount={hire.amount} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(hire.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hire card helper
// ---------------------------------------------------------------------------
function HireCard({
  hire,
  children,
}: {
  hire: DemoHire;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 text-sm font-bold text-white">
            {hire.listing.name.charAt(0)}
          </div>
          <div>
            <Link
              href={`/agents/${hire.listing.listingId}`}
              className="font-semibold text-gray-900 hover:text-indigo-600"
            >
              {hire.listing.name}
            </Link>
            <p className="text-sm text-gray-500">{hire.task}</p>
          </div>
        </div>

        <EscrowStatus
          state={hire.escrowState}
          amount={hire.amount}
          createdAt={hire.createdAt}
        />
      </div>

      {children}
    </div>
  );
}
