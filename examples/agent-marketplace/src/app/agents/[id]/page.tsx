'use client';

/**
 * Agent detail page.
 *
 * - Profile header with avatar, name, category, badge
 * - Reputation score bars
 * - Pricing & capabilities
 * - "Hire This Agent" form
 * - Reviews section
 * - Verification proof link
 */
import { useEffect, useState, use } from 'react';
import type { Listing, HireResult } from '@invariance/sdk';
import { useInvariance } from '@/hooks/useInvariance';
import { CATEGORIES, DEMO_LISTINGS, TIER_COLORS } from '@/lib/constants';
import VerifyBadge from '@/components/VerifyBadge';
import EscrowStatus from '@/components/EscrowStatus';
import ReviewForm from '@/components/ReviewForm';
import type { ReviewPayload } from '@/components/ReviewForm';

// ---------------------------------------------------------------------------
// Score bar helper
// ---------------------------------------------------------------------------
function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{value.toFixed(1)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stars display
// ---------------------------------------------------------------------------
function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <div className="flex">
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          className={`h-5 w-5 ${i < full ? 'text-amber-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution bar (for review distribution)
// ---------------------------------------------------------------------------
function DistributionRow({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-3 text-right text-gray-500">{stars}</span>
      <svg className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-gray-400">{count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { inv, isConnected } = useInvariance();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);

  // Hire form state
  const [taskDesc, setTaskDesc] = useState('');
  const [deadline, setDeadline] = useState('7d');
  const [hiring, setHiring] = useState(false);
  const [hireResult, setHireResult] = useState<HireResult | null>(null);
  const [hireError, setHireError] = useState<string | null>(null);

  // Load listing
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await inv.marketplace.get(id);
        if (!cancelled) setListing(result);
      } catch {
        // SDK throws TODO — fall back to demo data
        const demo = DEMO_LISTINGS.find((l) => l.listingId === id) ?? null;
        if (!cancelled) setListing(demo);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [inv, id]);

  // ------------------------------------------------------------------
  // Hire handler
  // ------------------------------------------------------------------
  async function handleHire(e: React.FormEvent) {
    e.preventDefault();
    if (!listing || !taskDesc.trim()) return;

    setHiring(true);
    setHireError(null);

    try {
      const result = await inv.marketplace.hire({
        listingId: listing.listingId,
        task: {
          description: taskDesc,
          deadline,
        },
        payment: {
          amount: listing.pricing.amount,
          type: 'escrow',
        },
      });
      setHireResult(result);
    } catch (err: unknown) {
      setHireError(err instanceof Error ? err.message : 'Failed to hire agent');
    } finally {
      setHiring(false);
    }
  }

  // ------------------------------------------------------------------
  // Review handler
  // ------------------------------------------------------------------
  async function handleReviewSubmit(review: ReviewPayload) {
    if (!hireResult) return;
    try {
      await inv.marketplace.complete(hireResult.hireId, {
        review: {
          rating: review.rating,
          comment: review.comment,
          categories: review.categories,
        },
      });
    } catch {
      // SDK throws TODO — review form already shows success state
    }
  }

  // ------------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="py-32 text-center">
        <p className="text-lg text-gray-500">Agent not found.</p>
      </div>
    );
  }

  const categoryInfo = CATEGORIES[listing.category];
  const tierClass = TIER_COLORS[listing.reputation.tier] ?? 'bg-gray-100 text-gray-600';
  const rep = listing.reputation;
  const dist = listing.reviewSummary.distribution;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* ================================================================ */}
      {/* Profile header */}
      {/* ================================================================ */}
      <div className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-start">
        {/* Avatar */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 text-3xl font-bold text-white">
          {listing.name.charAt(0)}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{listing.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tierClass}`}>
              {rep.tier}
            </span>
            {listing.identity.attestations > 0 && (
              <VerifyBadge txHash={listing.txHash} explorerUrl={listing.explorerUrl} />
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {categoryInfo?.label ?? listing.category} &middot; by{' '}
            <span className="font-mono text-xs">{listing.identity.address.slice(0, 10)}...</span>
          </p>
          <p className="mt-3 leading-relaxed text-gray-700">{listing.description}</p>

          {/* Capabilities */}
          <div className="mt-4 flex flex-wrap gap-2">
            {listing.capabilities.map((cap) => (
              <span
                key={cap}
                className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* Price card */}
        <div className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-500">Starting at</p>
          <p className="text-3xl font-bold text-gray-900">${listing.pricing.amount}</p>
          <p className="text-sm text-gray-500">
            USDC / {listing.pricing.type === 'per-task' ? 'task' : listing.pricing.type}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* ================================================================ */}
        {/* Left column: scores + reviews */}
        {/* ================================================================ */}
        <div className="space-y-8 lg:col-span-2">
          {/* Reputation scores */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Reputation Scores</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ScoreBar label="Overall" value={rep.overall} />
              <ScoreBar label="Reliability" value={rep.reliability} />
              <ScoreBar label="Speed" value={rep.speed} />
              <ScoreBar label="Consistency" value={rep.consistency} />
              <ScoreBar label="Policy Compliance" value={rep.policyCompliance} />
              <ScoreBar label="Volume" value={rep.volume} max={1000} />
            </div>
          </section>

          {/* Reviews */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>

            <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
              {/* Summary */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-4xl font-bold text-gray-900">
                  {listing.reviewSummary.average.toFixed(1)}
                </p>
                <Stars rating={listing.reviewSummary.average} />
                <p className="text-sm text-gray-500">
                  {listing.reviewSummary.count} review{listing.reviewSummary.count !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Distribution */}
              <div className="flex-1 space-y-1.5">
                <DistributionRow stars={5} count={dist['5']} total={listing.reviewSummary.count} />
                <DistributionRow stars={4} count={dist['4']} total={listing.reviewSummary.count} />
                <DistributionRow stars={3} count={dist['3']} total={listing.reviewSummary.count} />
                <DistributionRow stars={2} count={dist['2']} total={listing.reviewSummary.count} />
                <DistributionRow stars={1} count={dist['1']} total={listing.reviewSummary.count} />
              </div>
            </div>

            {/* Category averages */}
            {listing.reviewSummary.categoryAverages && (
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-4">
                {Object.entries(listing.reviewSummary.categoryAverages).map(([key, val]) => (
                  <div key={key} className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{val.toFixed(1)}</p>
                    <p className="text-xs capitalize text-gray-500">{key}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Leave review (only after successful hire) */}
          {hireResult && (
            <ReviewForm hireId={hireResult.hireId} onSubmit={handleReviewSubmit} />
          )}
        </div>

        {/* ================================================================ */}
        {/* Right column: Hire form */}
        {/* ================================================================ */}
        <div className="space-y-6">
          {hireResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
              <h3 className="font-semibold text-emerald-800">Agent Hired!</h3>
              <p className="mt-2 text-sm text-emerald-700">
                Escrow has been created. The agent will begin work shortly.
              </p>
              <div className="mt-4">
                <EscrowStatus
                  state="funded"
                  amount={listing.pricing.amount}
                  createdAt={Date.now()}
                />
              </div>
              {hireResult.explorerUrl && (
                <a
                  href={hireResult.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  View on Explorer &rarr;
                </a>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleHire}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-gray-900">Hire This Agent</h3>

              {!isConnected && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Connect your wallet to hire this agent.
                </p>
              )}

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Task Description
                  </label>
                  <textarea
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    rows={4}
                    placeholder="Describe what you need done..."
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Deadline</label>
                  <select
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                  >
                    <option value="1d">1 day</option>
                    <option value="3d">3 days</option>
                    <option value="7d">7 days</option>
                    <option value="14d">14 days</option>
                    <option value="30d">30 days</option>
                  </select>
                </div>

                {/* Payment summary */}
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Agent fee</span>
                    <span className="font-medium text-gray-800">
                      ${listing.pricing.amount} USDC
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-gray-600">Payment type</span>
                    <span className="font-medium text-gray-800">Escrow</span>
                  </div>
                  <hr className="my-2 border-gray-200" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800">Total</span>
                    <span className="text-lg font-bold text-gray-900">
                      ${listing.pricing.amount} USDC
                    </span>
                  </div>
                </div>

                {hireError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{hireError}</p>
                )}

                <button
                  type="submit"
                  disabled={!isConnected || hiring || !taskDesc.trim()}
                  className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {hiring ? 'Creating Escrow...' : `Hire for $${listing.pricing.amount} USDC`}
                </button>
              </div>
            </form>
          )}

          {/* Verification proof */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Verification</h3>
            <p className="mt-1 text-xs text-gray-500">
              This agent&apos;s identity and all actions are verified on-chain via Invariance
              Protocol.
            </p>
            <a
              href={listing.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              View Proof on Explorer
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
