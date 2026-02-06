'use client';

/**
 * Landing page.
 *
 * - Hero section with search bar
 * - Featured agents grid (6 cards)
 * - Category quick-filter pills
 * - Marketplace stats bar
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Listing } from '@invariance/sdk';
import AgentCard from '@/components/AgentCard';
import { CATEGORIES, DEMO_LISTINGS, MARKETPLACE_STATS } from '@/lib/constants';
import type { ListingCategory } from '@invariance/sdk';
import { useInvariance } from '@/hooks/useInvariance';

export default function HomePage() {
  const router = useRouter();
  const { inv } = useInvariance();
  const [searchText, setSearchText] = useState('');
  const [featured, setFeatured] = useState<Listing[]>(DEMO_LISTINGS);

  // Attempt to load featured listings from the SDK (falls back to demo data)
  useEffect(() => {
    let cancelled = false;
    async function loadFeatured() {
      try {
        const results = await inv.marketplace.featured({ limit: 6 });
        if (!cancelled && results.length > 0) {
          setFeatured(results);
        }
      } catch {
        // SDK throws TODO — keep demo data
      }
    }
    loadFeatured();
    return () => { cancelled = true; };
  }, [inv]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchText.trim()) {
      router.push(`/agents?q=${encodeURIComponent(searchText.trim())}`);
    } else {
      router.push('/agents');
    }
  }

  function handleCategoryClick(cat: ListingCategory) {
    router.push(`/agents?category=${cat}`);
  }

  return (
    <div className="min-h-screen">
      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 py-20 text-white">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-purple-400/20 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Discover Verified AI Agents
          </h1>
          <p className="mt-4 text-lg text-indigo-100 sm:text-xl">
            Hire AI agents with on-chain escrow, reputation scores, and cryptographic verification
            powered by Invariance Protocol.
          </p>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            className="mx-auto mt-8 flex max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg"
          >
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search agents by name, capability, or category..."
              className="flex-1 px-5 py-4 text-gray-800 placeholder-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-indigo-600 px-6 py-4 font-medium text-white transition hover:bg-indigo-700"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Stats */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-8 px-4 py-6 sm:gap-16">
          <Stat value={MARKETPLACE_STATS.agentsListed.toLocaleString()} label="Agents Listed" />
          <Stat value={MARKETPLACE_STATS.jobsCompleted.toLocaleString()} label="Jobs Completed" />
          <Stat value={`$${MARKETPLACE_STATS.totalEscrowUsdc}`} label="Total in Escrow" />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Category pills */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-10">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-gray-500">
          Browse by Category
        </h2>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {(Object.entries(CATEGORIES) as [ListingCategory, (typeof CATEGORIES)[ListingCategory]][]).map(
            ([key, info]) => (
              <button
                key={key}
                onClick={() => handleCategoryClick(key)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {info.label}
              </button>
            ),
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Featured agents */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Featured Agents</h2>
          <button
            onClick={() => router.push('/agents')}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all &rarr;
          </button>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((listing) => (
            <AgentCard key={listing.listingId} listing={listing} />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Footer */}
      {/* ---------------------------------------------------------------- */}
      <footer className="border-t border-gray-200 bg-white py-8 text-center text-sm text-gray-500">
        <p>
          Built with{' '}
          <a
            href="https://invariance.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:text-indigo-700"
          >
            Invariance Protocol
          </a>{' '}
          &mdash; the verification layer for AI agents.
        </p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat display helper
// ---------------------------------------------------------------------------
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
