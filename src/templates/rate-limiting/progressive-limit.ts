/**
 * Progressive rate limiter.
 */

import type { ProgressiveRateLimit, VerificationContext } from '@invariance/common';
import type { RateLimitChecker, RateLimitCheckResult, RateLimitState } from './checker.js';

export class ProgressiveRateLimiter implements RateLimitChecker<ProgressiveRateLimit> {
  async check(
    rule: ProgressiveRateLimit,
    context: VerificationContext,
    state?: RateLimitState,
  ): Promise<RateLimitCheckResult> {
    if (!state) {
      return {
        passed: true,
        ruleType: 'progressive-limit',
        message: 'No state - using initial limit',
        data: { currentLimit: rule.initialLimit },
      };
    }

    const key = `progressive:${context.sender.toLowerCase()}`;
    const level = state.getProgressiveLevel(key);

    // Calculate current limit based on progression
    let currentLimit: number;
    if (rule.progression.type === 'step' && rule.progression.steps) {
      const step = rule.progression.steps.find((s) => level < s.executionsRequired);
      currentLimit = step?.limit ?? rule.maxLimit;
    } else {
      currentLimit = Math.min(
        rule.initialLimit + level * rule.progression.increaseRate,
        rule.maxLimit,
      );
    }

    const windowMs = rule.windowSeconds * 1000;
    const count = state.getExecutionCount(key, windowMs, context.timestamp);

    if (count >= currentLimit) {
      return {
        passed: false,
        ruleType: 'progressive-limit',
        message: `Progressive limit exceeded: ${count}/${currentLimit}`,
        data: {
          count,
          currentLimit,
          level,
          maxLimit: rule.maxLimit,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'progressive-limit',
      message: `Progressive limit OK: ${count + 1}/${currentLimit}`,
      data: { count, currentLimit, level },
    };
  }
}
