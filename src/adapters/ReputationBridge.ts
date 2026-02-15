/**
 * Import/aggregate scores from external platforms.
 *
 * @example
 * ```typescript
 * const bridge = new ReputationBridge(inv);
 * bridge.importExternalScore('identity-123', {
 *   platform: 'gitcoin',
 *   score: 85,
 *   proofUrl: 'https://passport.gitcoin.co/...',
 *   fetchedAt: Date.now(),
 * });
 * const agg = await bridge.getAggregatedScore('identity-123');
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';

/** External score source */
export interface ExternalScore {
  /** Platform name (e.g., 'gitcoin', 'lens', 'olas') */
  platform: string;
  /** Score value (0-100 normalized) */
  score: number;
  /** Source URL or proof */
  proofUrl?: string;
  /** When the score was fetched */
  fetchedAt: number;
  /** Raw score data from the platform */
  rawData?: Record<string, unknown>;
}

/** Aggregation weights configuration */
export interface AggregationWeights {
  /** Weight for Invariance on-chain score (default: 0.7) */
  invariance: number;
  /** Weight for external scores (default: 0.3) */
  external: number;
}

/** Aggregated reputation result */
export interface AggregatedReputation {
  /** Final weighted score (0-100) */
  score: number;
  /** Invariance on-chain score component */
  invarianceScore: number;
  /** Average external score component */
  externalAverage: number;
  /** Individual external scores */
  externalScores: ExternalScore[];
  /** Weights used */
  weights: AggregationWeights;
  /** Number of sources */
  sourceCount: number;
}

/**
 * ReputationBridge — import and aggregate reputation from external platforms.
 */
export class ReputationBridge {
  private readonly client: Invariance;
  private readonly externalScores = new Map<string, ExternalScore[]>();
  private weights: AggregationWeights = { invariance: 0.7, external: 0.3 };

  constructor(client: Invariance, weights?: Partial<AggregationWeights>) {
    this.client = client;
    if (weights) {
      this.weights = { ...this.weights, ...weights };
    }
  }

  /**
   * Import an external reputation score for an identity.
   */
  importExternalScore(identityId: string, score: ExternalScore): void {
    const existing = this.externalScores.get(identityId) ?? [];
    const idx = existing.findIndex((s) => s.platform === score.platform);
    if (idx >= 0) {
      existing[idx] = score;
    } else {
      existing.push(score);
    }
    this.externalScores.set(identityId, existing);
  }

  /**
   * Get external scores for an identity.
   */
  getExternalScores(identityId: string): ExternalScore[] {
    return this.externalScores.get(identityId) ?? [];
  }

  /**
   * Get aggregated reputation score combining Invariance + external sources.
   */
  async getAggregatedScore(identityId: string): Promise<AggregatedReputation> {
    const onChain = await this.client.reputation.get(identityId);
    const invarianceScore = onChain.overall;

    const externalScores = this.getExternalScores(identityId);
    const externalAverage = externalScores.length > 0
      ? externalScores.reduce((sum, s) => sum + s.score, 0) / externalScores.length
      : 0;

    const hasExternal = externalScores.length > 0;
    const score = hasExternal
      ? this.weights.invariance * invarianceScore + this.weights.external * externalAverage
      : invarianceScore;

    return {
      score: Math.round(score * 100) / 100,
      invarianceScore,
      externalAverage: Math.round(externalAverage * 100) / 100,
      externalScores,
      weights: this.weights,
      sourceCount: 1 + externalScores.length,
    };
  }

  /**
   * Update aggregation weights.
   */
  setWeights(weights: Partial<AggregationWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Record external score as on-chain attestation.
   */
  async attestExternalScore(identityId: string, score: ExternalScore): Promise<string> {
    this.importExternalScore(identityId, score);

    const attestation = await this.client.identity.attest(identityId, {
      key: `reputation:${score.platform}`,
      value: JSON.stringify({
        score: score.score,
        proofUrl: score.proofUrl,
        fetchedAt: score.fetchedAt,
      }),
    });

    return attestation.txHash;
  }
}
