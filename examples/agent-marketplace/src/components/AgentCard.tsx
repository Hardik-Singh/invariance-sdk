'use client';

/**
 * Agent listing card for search results and featured grids.
 *
 * Shows name, category, rating, price, capabilities, and verification badge.
 */
import Link from 'next/link';
import type { Listing } from '@invariance/sdk';
import { CATEGORIES, TIER_COLORS } from '@/lib/constants';
import VerifyBadge from './VerifyBadge';

interface AgentCardProps {
  listing: Listing;
}

/** Render filled / empty stars for a given rating. */
function Stars({ rating, count }: { rating: number; count: number }) {
  const full = Math.round(rating);
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {Array.from({ length: 5 }, (_, i) => (
          <svg
            key={i}
            className={`h-4 w-4 ${i < full ? 'text-amber-400' : 'text-gray-200'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-xs text-gray-500">
        {rating.toFixed(1)} ({count})
      </span>
    </div>
  );
}

/** Category color badge. */
const CATEGORY_COLORS: Record<string, string> = {
  trading: 'bg-blue-100 text-blue-700',
  content: 'bg-pink-100 text-pink-700',
  analysis: 'bg-violet-100 text-violet-700',
  automation: 'bg-orange-100 text-orange-700',
  research: 'bg-teal-100 text-teal-700',
  creative: 'bg-rose-100 text-rose-700',
  development: 'bg-cyan-100 text-cyan-700',
  custom: 'bg-gray-100 text-gray-700',
};

export default function AgentCard({ listing }: AgentCardProps) {
  const categoryInfo = CATEGORIES[listing.category];
  const tierClass = TIER_COLORS[listing.reputation.tier] ?? 'bg-gray-100 text-gray-600';
  const catColor = CATEGORY_COLORS[listing.category] ?? 'bg-gray-100 text-gray-700';

  return (
    <div className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar placeholder */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-sm font-bold text-white">
            {listing.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{listing.name}</h3>
            <div className="mt-0.5 flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catColor}`}>
                {categoryInfo?.label ?? listing.category}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tierClass}`}>
                {listing.reputation.tier}
              </span>
            </div>
          </div>
        </div>

        {listing.identity.attestations > 0 && (
          <VerifyBadge txHash={listing.txHash} explorerUrl={listing.explorerUrl} />
        )}
      </div>

      {/* Description */}
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
        {listing.description}
      </p>

      {/* Rating */}
      <div className="mt-3">
        <Stars
          rating={listing.reviewSummary.average}
          count={listing.reviewSummary.count}
        />
      </div>

      {/* Capabilities */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {listing.capabilities.slice(0, 4).map((cap) => (
          <span
            key={cap}
            className="rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
          >
            {cap}
          </span>
        ))}
        {listing.capabilities.length > 4 && (
          <span className="text-xs text-gray-400">+{listing.capabilities.length - 4}</span>
        )}
      </div>

      {/* Footer: price + CTA */}
      <div className="mt-auto flex items-center justify-between pt-4">
        <div>
          <span className="text-lg font-bold text-gray-900">${listing.pricing.amount}</span>
          <span className="ml-1 text-xs text-gray-500">
            USDC / {listing.pricing.type === 'per-task' ? 'task' : listing.pricing.type}
          </span>
        </div>
        <Link
          href={`/agents/${listing.listingId}`}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 group-hover:shadow-sm"
        >
          Hire
        </Link>
      </div>
    </div>
  );
}
