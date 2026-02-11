import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode, type OnChainMetrics } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import {
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
  parseReviewIdFromLogs,
  hashMetadata,
} from '../../utils/contract-helpers.js';
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

/** On-chain ReviewStats struct */
interface OnChainReviewStats {
  totalReviews: bigint;
  totalRating: bigint;
  totalQuality: bigint;
  totalCommunication: bigint;
  totalSpeed: bigint;
  totalValue: bigint;
}

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
  private indexer: IndexerClient | null = null;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl());
    }
    return this.indexer;
  }

  /** Calculate on-chain metrics for an identity */
  private async calculateOnChainMetrics(identityId: `0x${string}`): Promise<OnChainMetrics> {
    try {
      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();

      if (available) {
        const data = await indexer.get<OnChainMetrics>(`/reputation/metrics/${fromBytes32(identityId)}`);
        return data;
      }
    } catch {
      // Fall through to default
    }

    return {
      totalActions: 0,
      successfulEscrows: 0,
      failedEscrows: 0,
      disputedEscrows: 0,
      disputesWon: 0,
      disputesLost: 0,
      successRate: 0,
      totalVolumeUsdc: '0',
      avgCompletionTimeSeconds: 0,
      firstAction: 0,
      lastAction: 0,
      uniqueCounterparties: 0,
      policyViolations: 0,
      actorType: 'agent',
    };
  }

  /** Calculate overall reputation score */
  private calculateOverallScore(reviewAvg: number, metrics: OnChainMetrics): number {
    const reliability = metrics.successRate / 100;
    const volume = Math.min(metrics.totalActions / 100, 1);
    const compliance = Math.max(0, 1 - (metrics.policyViolations / Math.max(metrics.totalActions, 1)));

    return (
      reviewAvg * 0.4 +
      reliability * 30 * 0.3 +
      volume * 100 * 0.15 +
      compliance * 100 * 0.15
    );
  }

  /** Determine tier from overall score */
  private determineTier(score: number): 'unrated' | 'bronze' | 'silver' | 'gold' | 'platinum' {
    if (score >= 90) return 'platinum';
    if (score >= 75) return 'gold';
    if (score >= 60) return 'silver';
    if (score >= 40) return 'bronze';
    return 'unrated';
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

    try {
      const identityContract = this.contracts.getContract('identity');

      // Get identity
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([address as `0x${string}`]) as `0x${string}`;

      // Get scores
      const scores = await this.score(address);

      // Get recent reviews
      const recentReviews = await this.getReviews(address, { limit: 5 });

      // Get badge
      const badge = await this.badge(address);

      // Get on-chain metrics
      const onChainMetrics = await this.calculateOnChainMetrics(identityId);

      const explorerBase = this.contracts.getExplorerBaseUrl();

      return {
        identity: {
          identityId: fromBytes32(identityId),
          type: 'agent',
          address,
          owner: address,
          label: '',
          capabilities: [],
          status: 'active',
          attestations: 0,
          createdAt: 0,
          txHash: '',
          explorerUrl: `${explorerBase}/identity/${fromBytes32(identityId)}`,
        },
        scores,
        reviews: {
          average: scores.reviewAverage,
          count: scores.reviewCount,
          distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
          recentReviews: recentReviews.reviews,
        },
        onChainMetrics,
        badge,
        lastUpdated: Date.now(),
        explorerUrl: `${explorerBase}/reputation/${address}`,
      };
    } catch (err) {
      throw mapContractError(err);
    }
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

    try {
      const contract = this.contracts.getContract('review');
      const identityContract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();

      // Get current account
      const accountAddress = this.contracts.getWalletAddress() as `0x${string}`;

      // Resolve reviewer and target identity IDs
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');

      const reviewerIdentityId = await resolveFn([accountAddress]) as `0x${string}`;
      const targetIdentityId = await resolveFn([opts.target as `0x${string}`]) as `0x${string}`;

      // Hash comment
      const commentHash = opts.comment ? hashMetadata({ comment: opts.comment }) : toBytes32('');

      // Default category ratings to overall rating
      const qualityRating = opts.categories?.quality ?? opts.rating;
      const communicationRating = opts.categories?.communication ?? opts.rating;
      const speedRating = opts.categories?.speed ?? opts.rating;
      const valueRating = opts.categories?.value ?? opts.rating;

      // Submit review
      const submitFn = contract.write['submit'];
      if (!submitFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'submit function not found');

      const escrowIdBytes = toBytes32(opts.escrowId);
      const txHash = await submitFn([
        reviewerIdentityId,
        targetIdentityId,
        escrowIdBytes,
        opts.rating,
        commentHash,
        qualityRating,
        communicationRating,
        speedRating,
        valueRating,
      ]);

      const receipt = await waitForReceipt(publicClient, txHash);
      const reviewId = parseReviewIdFromLogs(receipt.logs);

      const explorerBase = this.contracts.getExplorerBaseUrl();
      const result: Review = {
        reviewId: fromBytes32(reviewId),
        reviewer: { type: 'agent', address: accountAddress },
        target: { type: 'agent', address: opts.target },
        escrowId: opts.escrowId,
        rating: opts.rating,
        ...(opts.comment !== undefined && { comment: opts.comment }),
        ...(opts.categories !== undefined && { categories: opts.categories }),
        timestamp: Date.now(),
        txHash: receipt.txHash,
        verified: true,
        explorerUrl: `${explorerBase}/tx/${receipt.txHash}`,
      };

      this.events.emit('reputation.reviewed', {
        reviewId: result.reviewId,
        target: opts.target,
        rating: opts.rating,
      });

      return result;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Get all reviews for an identity.
   *
   * @param address - The identity address
   * @param opts - Optional query options (pagination, sorting)
   * @returns Paginated review list
   */
  async getReviews(address: string, opts?: ReviewQueryOptions): Promise<ReviewList> {
    this.telemetry.track('reputation.getReviews');

    try {
      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();

      if (!available) {
        return { reviews: [], total: 0, page: 1 };
      }

      const params: Record<string, string | number | undefined> = {
        target: address,
        limit: opts?.limit ?? 10,
        offset: opts?.offset ?? 0,
        sortBy: opts?.sortBy ?? 'newest',
      };

      const data = await indexer.get<{ reviews: Review[]; total: number }>('/reviews', params);
      return {
        reviews: data.reviews,
        total: data.total,
        page: Math.floor((opts?.offset ?? 0) / (opts?.limit ?? 10)) + 1,
      };
    } catch {
      return { reviews: [], total: 0, page: 1 };
    }
  }

  /**
   * Get numeric reputation scores only (lighter than full profile).
   *
   * @param address - The identity address
   * @returns Reputation scores
   */
  async score(address: string): Promise<ReputationScore> {
    this.telemetry.track('reputation.score');

    try {
      const contract = this.contracts.getContract('review');
      const identityContract = this.contracts.getContract('identity');

      // Resolve identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([address as `0x${string}`]) as `0x${string}`;

      // Get review stats
      const getStatsFn = contract.read['getStats'];
      if (!getStatsFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getStats function not found');
      const stats = await getStatsFn([identityId]) as OnChainReviewStats;

      const reviewCount = Number(stats.totalReviews);
      const reviewAverage = reviewCount > 0 ? Number(stats.totalRating) / reviewCount : 0;

      // Get on-chain metrics
      const metrics = await this.calculateOnChainMetrics(identityId);

      const overall = this.calculateOverallScore(reviewAverage, metrics);
      const tier = this.determineTier(overall);

      return {
        overall,
        reliability: metrics.successRate,
        speed: metrics.avgCompletionTimeSeconds > 0 ? Math.max(0, 100 - metrics.avgCompletionTimeSeconds / 3600) : 0,
        volume: Math.min(metrics.totalActions / 10, 100),
        consistency: reviewCount > 5 ? 80 : reviewCount * 16,
        policyCompliance: Math.max(0, 100 - (metrics.policyViolations / Math.max(metrics.totalActions, 1)) * 100),
        reviewAverage,
        reviewCount,
        tier,
      };
    } catch (err) {
      throw mapContractError(err);
    }
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

    try {
      // Fetch scores for all addresses in parallel
      const scoresPromises = addresses.map((addr) => this.score(addr).catch(() => null));
      const metricsPromises = addresses.map(async (addr) => {
        const identityContract = this.contracts.getContract('identity');
        const resolveFn = identityContract.read['resolve'];
        if (!resolveFn) return null;
        const identityId = await resolveFn([addr as `0x${string}`]) as `0x${string}`;
        return this.calculateOnChainMetrics(identityId).catch(() => null);
      });

      const [scoresResults, metricsResults] = await Promise.all([
        Promise.all(scoresPromises),
        Promise.all(metricsPromises),
      ]);

      const identities = addresses.map((addr, i) => {
        const scores = scoresResults[i];
        const metrics = metricsResults[i];
        return {
          address: addr,
          type: metrics?.actorType ?? 'agent' as const,
          overall: scores?.overall ?? 0,
          reviewAverage: scores?.reviewAverage ?? 0,
          successRate: metrics?.successRate ?? 0,
          totalVolume: metrics?.totalVolumeUsdc ?? '0',
          tier: scores?.tier ?? 'unrated',
        };
      });

      // Sort by overall score descending
      const ranked = [...identities]
        .sort((a, b) => b.overall - a.overall)
        .map((i) => i.address);

      return { identities, ranked };
    } catch {
      return { identities: [], ranked: [] };
    }
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
  async badge(address: string): Promise<Badge | null> {
    this.telemetry.track('reputation.badge');

    try {
      const scores = await this.score(address);
      const identityContract = this.contracts.getContract('identity');

      // Resolve identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([address as `0x${string}`]) as `0x${string}`;

      // Get on-chain metrics
      const metrics = await this.calculateOnChainMetrics(identityId);

      // Elite badge: 95%+ policy compliance with 100+ actions
      if (metrics.totalActions >= 100 && scores.policyCompliance >= 95) {
        return {
          type: 'elite',
          label: 'Elite (95%+ compliance, 100+ actions)',
          earnedAt: Date.now(),
        };
      }

      // Trusted badge: 50+ verified actions
      if (metrics.totalActions >= 50) {
        return {
          type: 'trusted',
          label: 'Trusted (50+ actions)',
          earnedAt: Date.now(),
        };
      }

      // Verified badge: Has attestations
      const getFn = identityContract.read['get'];
      if (getFn) {
        const identity = await getFn([identityId]);
        if (identity && (identity as { attestations?: number }).attestations && (identity as { attestations: number }).attestations > 0) {
          return {
            type: 'verified',
            label: 'Verified Identity',
            earnedAt: Date.now(),
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get score changes over time.
   *
   * @param address - The identity address
   * @param opts - Optional query options (time range, limit)
   * @returns Score history with entries
   */
  async history(address: string, opts?: ScoreHistoryOptions): Promise<ScoreHistory> {
    this.telemetry.track('reputation.history');

    try {
      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();

      if (!available) {
        return { address, entries: [] };
      }

      const params: Record<string, string | number | undefined> = {
        from: typeof opts?.from === 'string' ? opts.from : opts?.from?.toString(),
        to: typeof opts?.to === 'string' ? opts.to : opts?.to?.toString(),
        limit: opts?.limit ?? 100,
      };

      const data = await indexer.get<ScoreHistory>(`/reputation/history/${address}`, params);
      return data;
    } catch {
      return { address, entries: [] };
    }
  }
}
