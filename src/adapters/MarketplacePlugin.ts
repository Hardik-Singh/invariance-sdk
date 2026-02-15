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
    const { generateBadge, badgeThreshold: _badgeThreshold, ...listingOpts } = opts;
    const listing = await this.client.marketplace.register(listingOpts);

    let badge: Badge | undefined;
    if (generateBadge && listing.identity) {
      const identityId = typeof listing.identity === 'string'
        ? listing.identity
        : listing.identity.identityId;
      badge = await this.client.reputation.badge(identityId);
    }

    return { listing, badge };
  }

  /**
   * Hire an agent with automatic escrow funding.
   */
  async hireWithEscrow(opts: HireWithEscrowOptions): Promise<HireResult> {
    return this.client.hireAndFund({
      listingId: opts.listingId,
      task: opts.task,
      payment: opts.payment,
      fundAmount: opts.fundAmount,
    });
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
        badge = await this.client.reputation.badge(identityId);
      } catch {
        // No badge available
      }
    }

    return { listing, badge };
  }
}
