import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type {
  ReputationProfile,
  ReputationScore,
  SubmitReviewOptions,
  Review,
  Badge,
  ComparisonResult,
  ScoreHistory,
  ReviewList,
  ReviewQueryOptions,
  ScoreHistoryOptions,
} from './types.js';

/**
 * Auto-calculated reputation scores and 1-5 star reviews.
 *
 * Reputation applies to all identity types. The scoring model is identical.
 * Reviews are 1-5 stars, cryptographically linked to completed escrows.
 * No escrow = no review. Fake reviews are mathematically impossible.
 *
 * @example
 * ```typescript
 * const rep = await inv.reputation.get('0xTradingBot');
 * console.log(rep.scores.overall, rep.scores.tier);
 *
 * const review = await inv.reputation.review({
 *   target: '0xTradingBot',
 *   escrowId: 'esc_abc',
 *   rating: 5,
 *   comment: 'Excellent execution',
 * });
 * ```
 */
export class ReputationEngine {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Get the contract address for the review module */
  getContractAddress(): string {
    return this.contracts.getAddress('review');
  }

  /**
   * Get full reputation profile for any identity.
   *
   * Includes scores, reviews, on-chain metrics, badges, and explorer URL.
   *
   * @param address - The identity address
   * @returns Full reputation profile
   */
  async get(address: string): Promise<ReputationProfile> {
    this.telemetry.track('reputation.get');

    // TODO: Fetch from indexer/API
    // 1. Get identity details
    // 2. Calculate scores from on-chain metrics
    // 3. Fetch reviews
    // 4. Determine badge
    throw new InvarianceError(
      ErrorCode.IDENTITY_NOT_FOUND,
      `Identity not found: ${address}`,
    );
  }

  /**
   * Submit a 1-5 star review.
   *
   * Reviews MUST reference a completed escrow between the reviewer
   * and the target. This is enforced on-chain. No escrow = no review.
   *
   * @param opts - Review options (target, escrowId, rating)
   * @returns The submitted review
   * @throws {InvarianceError} With NO_ESCROW_FOR_REVIEW if no qualifying escrow
   * @throws {InvarianceError} With ALREADY_REVIEWED if already reviewed
   */
  async review(opts: SubmitReviewOptions): Promise<Review> {
    this.telemetry.track('reputation.review', { rating: opts.rating });

    // TODO: Submit review to InvarianceReview contract
    // 1. Verify escrow exists and is completed
    // 2. Verify reviewer was counterparty
    // 3. Verify not already reviewed
    // 4. Call review.submitReview(target, escrowId, rating, commentHash, categories)
    // 5. Parse ReviewSubmitted event
    this.events.emit('reputation.reviewed', {
      reviewId: 'pending',
      target: opts.target,
      rating: opts.rating,
    });

    throw new InvarianceError(
      ErrorCode.NO_ESCROW_FOR_REVIEW,
      `No qualifying escrow found for review of ${opts.target}.`,
    );
  }

  /**
   * Get all reviews for an identity.
   *
   * @param address - The identity address
   * @param opts - Optional query options (pagination, sorting)
   * @returns Paginated review list
   */
  async getReviews(_address: string, _opts?: ReviewQueryOptions): Promise<ReviewList> {
    this.telemetry.track('reputation.getReviews');

    // TODO: Query indexer for reviews
    return {
      reviews: [],
      total: 0,
      page: 1,
    };
  }

  /**
   * Get numeric reputation scores only (lighter than full profile).
   *
   * @param address - The identity address
   * @returns Reputation scores
   */
  async score(_address: string): Promise<ReputationScore> {
    this.telemetry.track('reputation.score');

    // TODO: Calculate from on-chain metrics
    return {
      overall: 0,
      reliability: 0,
      speed: 0,
      volume: 0,
      consistency: 0,
      policyCompliance: 0,
      reviewAverage: 0,
      reviewCount: 0,
      tier: 'unrated',
    };
  }

  /**
   * Compare multiple identities side-by-side.
   *
   * Returns ranked comparison with key metrics for each identity.
   *
   * @param addresses - Array of identity addresses to compare
   * @returns Comparison result with rankings
   */
  async compare(addresses: string[]): Promise<ComparisonResult> {
    this.telemetry.track('reputation.compare', { count: addresses.length });

    // TODO: Fetch scores for all addresses and rank
    return {
      identities: [],
      ranked: [],
    };
  }

  /**
   * Get earned badge for an identity.
   *
   * Badges are auto-calculated based on on-chain metrics:
   * - Verified: Has attestations
   * - Trusted: 50+ verified actions
   * - Elite: 95%+ policy compliance with 100+ actions
   *
   * @param address - The identity address
   * @returns Badge or null if none earned
   */
  async badge(_address: string): Promise<Badge | null> {
    this.telemetry.track('reputation.badge');

    // TODO: Calculate badge from on-chain metrics
    return null;
  }

  /**
   * Get score changes over time.
   *
   * @param address - The identity address
   * @param opts - Optional query options (time range, limit)
   * @returns Score history with entries
   */
  async history(address: string, _opts?: ScoreHistoryOptions): Promise<ScoreHistory> {
    this.telemetry.track('reputation.history');

    // TODO: Query indexer for score history
    return {
      address,
      entries: [],
    };
  }
}
