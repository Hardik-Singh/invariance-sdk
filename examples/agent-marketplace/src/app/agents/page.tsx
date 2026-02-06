'use client';

/**
 * Agent search results page.
 *
 * - Search bar at top
 * - Sidebar filters: category checkboxes, rating slider, price range
 * - Grid of AgentCards
 * - Pagination
 */
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Listing, ListingCategory, SearchQuery } from '@invariance/sdk';
import AgentCard from '@/components/AgentCard';
import { CATEGORIES, DEMO_LISTINGS } from '@/lib/constants';
import { useInvariance } from '@/hooks/useInvariance';

const PAGE_SIZE = 12;

export default function AgentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { inv } = useInvariance();

  // Query state
  const [searchText, setSearchText] = useState(searchParams.get('q') ?? '');
  const [selectedCategories, setSelectedCategories] = useState<Set<ListingCategory>>(() => {
    const cat = searchParams.get('category') as ListingCategory | null;
    return cat ? new Set([cat]) : new Set();
  });
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<SearchQuery['sortBy']>('rating');
  const [page, setPage] = useState(1);

  // Results
  const [listings, setListings] = useState<Listing[]>(DEMO_LISTINGS);
  const [total, setTotal] = useState(DEMO_LISTINGS.length);
  const [loading, setLoading] = useState(false);

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------
  const doSearch = useCallback(async () => {
    setLoading(true);

    const query: SearchQuery = {
      text: searchText || undefined,
      category: selectedCategories.size === 1 ? [...selectedCategories][0] : undefined,
      minRating: minRating > 0 ? minRating : undefined,
      maxPrice: maxPrice || undefined,
      sortBy,
      page,
      pageSize: PAGE_SIZE,
    };

    try {
      const results = await inv.marketplace.search(query);
      setListings(results.listings);
      setTotal(results.total);
    } catch {
      // SDK throws TODO — apply client-side filtering on demo data
      let filtered = [...DEMO_LISTINGS];

      if (query.text) {
        const q = query.text.toLowerCase();
        filtered = filtered.filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            l.description.toLowerCase().includes(q) ||
            l.capabilities.some((c) => c.toLowerCase().includes(q)),
        );
      }
      if (selectedCategories.size > 0) {
        filtered = filtered.filter((l) => selectedCategories.has(l.category));
      }
      if (minRating > 0) {
        filtered = filtered.filter((l) => l.reviewSummary.average >= minRating);
      }
      if (maxPrice) {
        filtered = filtered.filter((l) => parseFloat(l.pricing.amount) <= parseFloat(maxPrice));
      }

      // Sort
      if (sortBy === 'rating') {
        filtered.sort((a, b) => b.reviewSummary.average - a.reviewSummary.average);
      } else if (sortBy === 'price') {
        filtered.sort((a, b) => parseFloat(a.pricing.amount) - parseFloat(b.pricing.amount));
      } else if (sortBy === 'newest') {
        filtered.sort((a, b) => b.createdAt - a.createdAt);
      }

      setTotal(filtered.length);
      const start = (page - 1) * PAGE_SIZE;
      setListings(filtered.slice(start, start + PAGE_SIZE));
    } finally {
      setLoading(false);
    }
  }, [inv, searchText, selectedCategories, minRating, maxPrice, sortBy, page]);

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    doSearch();
  }

  function toggleCategory(cat: ListingCategory) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search agents..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          Search
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* ------------------------------------------------------------ */}
        {/* Sidebar filters */}
        {/* ------------------------------------------------------------ */}
        <aside className="w-full shrink-0 space-y-6 lg:w-60">
          {/* Categories */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Category</h3>
            <div className="space-y-1.5">
              {(Object.entries(CATEGORIES) as [ListingCategory, (typeof CATEGORIES)[ListingCategory]][]).map(
                ([key, info]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.has(key)}
                      onChange={() => toggleCategory(key)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {info.label}
                  </label>
                ),
              )}
            </div>
          </div>

          {/* Min rating */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Minimum Rating</h3>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={minRating}
              onChange={(e) => {
                setMinRating(parseFloat(e.target.value));
                setPage(1);
              }}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Any</span>
              <span>{minRating > 0 ? `${minRating}+` : 'Any'}</span>
              <span>5</span>
            </div>
          </div>

          {/* Max price */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Max Price (USDC)</h3>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. 100"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          </div>

          {/* Sort */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Sort By</h3>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SearchQuery['sortBy']);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            >
              <option value="rating">Highest Rated</option>
              <option value="price">Lowest Price</option>
              <option value="newest">Newest</option>
              <option value="volume">Most Popular</option>
            </select>
          </div>
        </aside>

        {/* ------------------------------------------------------------ */}
        {/* Results grid */}
        {/* ------------------------------------------------------------ */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} agent{total !== 1 ? 's' : ''} found
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : listings.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
              <p className="text-gray-500">No agents match your filters.</p>
              <button
                onClick={() => {
                  setSearchText('');
                  setSelectedCategories(new Set());
                  setMinRating(0);
                  setMaxPrice('');
                  setPage(1);
                }}
                className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {listings.map((listing) => (
                <AgentCard key={listing.listingId} listing={listing} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

