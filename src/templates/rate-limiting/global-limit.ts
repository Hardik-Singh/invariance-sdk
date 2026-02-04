/**
 * Global rate limiter.
 */

import type { GlobalRateLimit, VerificationContext } from '@invariance/common';
import type { RateLimitChecker, RateLimitCheckResult, RateLimitState } from './checker.js';

export class GlobalRateLimiter implements RateLimitChecker<GlobalRateLimit> {
  async check(
    rule: GlobalRateLimit,
    context: VerificationContext,
    state?: RateLimitState,
  ): Promise<RateLimitCheckResult> {
    if (!state) {
      return { passed: true, ruleType: 'global-limit', message: 'No state' };
    }

    const key = 'global';
    const windowMs = rule.windowSeconds * 1000;
    const count = state.getExecutionCount(key, windowMs, context.timestamp);

    // Check burst capacity if configured
    const effectiveLimit = rule.burstCapacity ?? rule.maxExecutions;

    if (count >= effectiveLimit) {
      return {
        passed: false,
        ruleType: 'global-limit',
        message: `Global rate limit exceeded: ${count}/${effectiveLimit}`,
        data: {
          count,
          maxExecutions: rule.maxExecutions,
          burstCapacity: rule.burstCapacity,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'global-limit',
      message: `Global rate limit OK: ${count + 1}/${effectiveLimit}`,
      data: { currentCount: count, limit: effectiveLimit },
    };
  }
}
