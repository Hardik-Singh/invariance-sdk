/**
 * Reputation-based rate limiter.
 */

import type { ReputationBasedRateLimit, VerificationContext } from '@invariance/common';
import type { RateLimitChecker, RateLimitCheckResult, RateLimitState } from './checker.js';

export interface ReputationProofData {
  reputation: number;
}

export class ReputationRateLimiter implements RateLimitChecker<ReputationBasedRateLimit> {
  async check(
    rule: ReputationBasedRateLimit,
    context: VerificationContext,
    state?: RateLimitState,
  ): Promise<RateLimitCheckResult> {
    // Get reputation from context or proof
    const reputation = (context.data?.['reputation'] as number) ?? 0;

    // Find applicable tier
    let limit = rule.baseLimit;
    for (const tier of rule.tiers.sort((a, b) => b.minReputation - a.minReputation)) {
      if (reputation >= tier.minReputation) {
        limit = tier.limit;
        break;
      }
    }

    // Cap at maxLimit
    limit = Math.min(limit, rule.maxLimit);

    if (!state) {
      return {
        passed: true,
        ruleType: 'reputation-based',
        message: 'No state',
        data: { reputation, limit },
      };
    }

    const key = `reputation:${context.sender.toLowerCase()}`;
    const windowMs = rule.windowSeconds * 1000;
    const count = state.getExecutionCount(key, windowMs, context.timestamp);

    if (count >= limit) {
      return {
        passed: false,
        ruleType: 'reputation-based',
        message: `Reputation-based limit exceeded: ${count}/${limit}`,
        data: {
          reputation,
          count,
          limit,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'reputation-based',
      message: `Reputation limit OK: ${count + 1}/${limit}`,
      data: { reputation, count, limit },
    };
  }
}
