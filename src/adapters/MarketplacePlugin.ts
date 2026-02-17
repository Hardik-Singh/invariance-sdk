/**
 * Publish agents to external stores with verified badges.
 *
 * @example
 * ```typescript
 * const plugin = new MarketplacePlugin(inv);
 * const { listing, badge } = await plugin.publishAgent({
 *   identity: 'identity-123',
 *   name: 'DataAnalyzer',
 *   description: 'Analyzes datasets with ML',
 *   category: 'analytics',
 *   pricing: { model: 'per-task', amount: '50' },
 *   generateBadge: true,
 * });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';
import type { Listing, RegisterListingOptions, HireResult } from '../modules/marketplace/types.js';
import type { Badge } from '../modules/reputation/types.js';

/** Options for publishing an agent */
export interface PublishAgentOptions extends RegisterListingOptions {
  /** Auto-generate a reputation badge on publish */
  generateBadge?: boolean;
  /** Minimum reputation score required for badge */
  badgeThreshold?: number;
}

/** Result of publishing an agent */
export interface PublishResult {
  /** Created marketplace listing */
  listing: Listing;
  /** Generated badge (if requested) */
  badge?: Badge;
}

/** Options for hiring with escrow */
export interface HireWithEscrowOptions {
  /** Listing ID to hire from */
  listingId: string;
  /** Task description */
  task: { description: string; deadline?: string };
  /** Payment configuration */
  payment: { amount: string; type: 'escrow' };
  /** Optional fund amount override */
  fundAmount?: string;
}

/**
 * MarketplacePlugin — simplified publish + hire flows with verified badges.
 */
export class MarketplacePlugin {
  private readonly client: Invariance;

  constructor(client: Invariance) {
    this.client = client;
  }

  /**
   * Publish an agent listing with optional reputation badge.
   */
  async publishAgent(opts: PublishAgentOptions): Promise<PublishResult> {
    const { generateBadge, ...listingOpts } = opts;
    const listing = await this.client.marketplace.register(listingOpts);

    let badge: Badge | undefined;
    if (generateBadge && listing.identity) {
      const identityId = typeof listing.identity === 'string'
        ? listing.identity
        : listing.identity.identityId;
      const maybeBadge = await this.client.reputation.badge(identityId);
      badge = maybeBadge ?? undefined;
    }

    const result: PublishResult = { listing };
    if (badge) result.badge = badge;
    return result;
  }

  /**
   * Hire an agent with automatic escrow funding.
   */
  async hireWithEscrow(opts: HireWithEscrowOptions): Promise<HireResult> {
    const deadline = opts.task.deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const hireOpts: Parameters<Invariance['hireAndFund']>[0] = {
      listingId: opts.listingId,
      task: { ...opts.task, deadline },
      payment: opts.payment,
    };
    if (opts.fundAmount) hireOpts.fundAmount = opts.fundAmount;

    return this.client.hireAndFund(hireOpts);
  }

  /**
   * Get verified listing with reputation data.
   */
  async getVerifiedListing(listingId: string): Promise<{ listing: Listing; badge?: Badge }> {
    const listing = await this.client.marketplace.get(listingId);
    let badge: Badge | undefined;

    if (listing.identity) {
      const identityId = typeof listing.identity === 'string'
        ? listing.identity
        : listing.identity.identityId;
      try {
        const maybeBadge = await this.client.reputation.badge(identityId);
        badge = maybeBadge ?? undefined;
      } catch {
        // No badge available
      }
    }

    const result: { listing: Listing; badge?: Badge } = { listing };
    if (badge) result.badge = badge;
    return result;
  }
}
