'use client';

/**
 * Register agent form.
 *
 * 1. Fills agent identity details
 * 2. Creates a marketplace listing
 * 3. Shows live preview card
 *
 * Calls `inv.identity.register()` then `inv.marketplace.register()`.
 */
import { useState } from 'react';
import type { ListingCategory, PricingModel, Listing } from '@invariance/sdk';
import { useInvariance } from '@/hooks/useInvariance';
import { CATEGORIES, DEMO_LISTINGS } from '@/lib/constants';
import AgentCard from '@/components/AgentCard';

type PricingType = PricingModel['type'];

const PRICING_TYPES: { value: PricingType; label: string }[] = [
  { value: 'per-task', label: 'Per Task' },
  { value: 'fixed', label: 'Fixed Price' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'subscription', label: 'Subscription' },
];

export default function RegisterPage() {
  const { inv, isConnected, address } = useInvariance();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ListingCategory>('automation');
  const [pricingType, setPricingType] = useState<PricingType>('per-task');
  const [pricingAmount, setPricingAmount] = useState('');
  const [capInput, setCapInput] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [maxResponseTime, setMaxResponseTime] = useState('24h');
  const [uptime, setUptime] = useState('99.5');
  const [refundPolicy, setRefundPolicy] = useState('Full refund if not started within 48h');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Tag input handlers
  // ------------------------------------------------------------------
  function addCapability() {
    const trimmed = capInput.trim().toLowerCase();
    if (trimmed && !capabilities.includes(trimmed)) {
      setCapabilities((prev) => [...prev, trimmed]);
    }
    setCapInput('');
  }

  function removeCapability(cap: string) {
    setCapabilities((prev) => prev.filter((c) => c !== cap));
  }

  function handleCapKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCapability();
    }
  }

  // ------------------------------------------------------------------
  // Preview listing
  // ------------------------------------------------------------------
  const previewListing: Listing = {
    listingId: 'preview',
    identity: {
      identityId: 'preview-id',
      type: 'agent',
      address: address ?? '0x0000000000000000000000000000000000000000',
      owner: address ?? '0x0000000000000000000000000000000000000000',
      label: name || 'Your Agent',
      capabilities,
      status: 'active',
      attestations: 0,
      createdAt: Date.now(),
      txHash: '0x0',
      explorerUrl: '#',
    },
    name: name || 'Your Agent Name',
    description: description || 'Your agent description will appear here...',
    category,
    pricing: {
      type: pricingType,
      amount: pricingAmount || '0',
      currency: 'USDC',
    },
    capabilities,
    reputation: {
      overall: 0,
      reliability: 0,
      speed: 0,
      volume: 0,
      consistency: 0,
      policyCompliance: 0,
      reviewAverage: 0,
      reviewCount: 0,
      tier: 'unrated',
    },
    reviewSummary: {
      average: 0,
      count: 0,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      recentReviews: [],
    },
    active: true,
    createdAt: Date.now(),
    txHash: '0x0',
    explorerUrl: '#',
  };

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) return;

    setSubmitting(true);
    setError(null);

    try {
      // Step 1: Register identity
      const identity = await inv.identity.register({
        type: 'agent',
        owner: address,
        label: name,
        capabilities,
      });

      // Step 2: Register listing
      await inv.marketplace.register({
        identity: identity.identityId,
        name,
        description,
        category,
        pricing: {
          type: pricingType,
          amount: pricingAmount,
          currency: 'USDC',
        },
        capabilities,
        sla: {
          maxResponseTime,
          uptime: parseFloat(uptime),
          refundPolicy,
        },
      });

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  // ------------------------------------------------------------------
  // Success state
  // ------------------------------------------------------------------
  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">Agent Registered!</h2>
        <p className="mt-2 text-gray-500">
          Your agent identity and marketplace listing have been created on-chain.
        </p>
        <p className="mt-1 text-sm text-gray-400">
          It may take a few moments for the listing to appear in search results.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Register a New Agent</h1>
      <p className="mt-1 text-gray-500">
        Create an on-chain identity and marketplace listing for your AI agent.
      </p>

      {!isConnected && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Connect your wallet to register an agent.
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* ============================================================ */}
        {/* Form (3 cols) */}
        {/* ============================================================ */}
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-3">
          {/* Agent name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. DataAnalyzer Pro"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              placeholder="Describe what your agent does, its strengths, and use cases..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ListingCategory)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            >
              {(Object.entries(CATEGORIES) as [ListingCategory, (typeof CATEGORIES)[ListingCategory]][]).map(
                ([key, info]) => (
                  <option key={key} value={key}>
                    {info.label}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* Pricing */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Pricing Model</label>
              <select
                value={pricingType}
                onChange={(e) => setPricingType(e.target.value as PricingType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
              >
                {PRICING_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Amount (USDC)
              </label>
              <input
                type="number"
                value={pricingAmount}
                onChange={(e) => setPricingAmount(e.target.value)}
                required
                min="0"
                step="0.01"
                placeholder="50"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
              />
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Capabilities</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={capInput}
                onChange={(e) => setCapInput(e.target.value)}
                onKeyDown={handleCapKeyDown}
                placeholder="Type a capability and press Enter"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCapability}
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Add
              </button>
            </div>
            {capabilities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                  >
                    {cap}
                    <button
                      type="button"
                      onClick={() => removeCapability(cap)}
                      className="text-indigo-400 hover:text-indigo-700"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* SLA */}
          <fieldset className="rounded-lg border border-gray-200 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">
              Service-Level Agreement
            </legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-600">Max Response Time</label>
                <input
                  type="text"
                  value={maxResponseTime}
                  onChange={(e) => setMaxResponseTime(e.target.value)}
                  placeholder="24h"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600">Uptime (%)</label>
                <input
                  type="number"
                  value={uptime}
                  onChange={(e) => setUptime(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs text-gray-600">Refund Policy</label>
              <input
                type="text"
                value={refundPolicy}
                onChange={(e) => setRefundPolicy(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
              />
            </div>
          </fieldset>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={!isConnected || submitting}
            className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Registering on-chain...' : 'Register Agent'}
          </button>
        </form>

        {/* ============================================================ */}
        {/* Preview card (2 cols) */}
        {/* ============================================================ */}
        <div className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Live Preview</h3>
          <AgentCard listing={previewListing} />

          {/* Tip */}
          <div className="mt-4 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-700">
            <p className="font-medium">How it works</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-indigo-600">
              <li>An on-chain identity is created for your agent</li>
              <li>A marketplace listing is published with your pricing</li>
              <li>Users can discover, hire, and pay via USDC escrow</li>
              <li>Reputation builds automatically from on-chain activity</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
