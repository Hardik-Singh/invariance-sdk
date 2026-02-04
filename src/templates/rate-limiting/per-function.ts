/**
 * Per-function rate limiter.
 */

import type { PerFunctionRateLimit, VerificationContext } from '@invariance/common';
import type { RateLimitChecker, RateLimitCheckResult, RateLimitState } from './checker.js';

export class PerFunctionRateLimiter implements RateLimitChecker<PerFunctionRateLimit> {
  async check(
    rule: PerFunctionRateLimit,
    context: VerificationContext,
    state?: RateLimitState,
  ): Promise<RateLimitCheckResult> {
    if (!state) {
      return { passed: true, ruleType: 'per-function', message: 'No state' };
    }

    const functionSelector = (context.data?.['functionSelector'] as string) ?? 'unknown';

    // Check if this function is in the limited selectors
    if (!rule.functionSelectors.includes(functionSelector)) {
      return {
        passed: true,
        ruleType: 'per-function',
        message: 'Function not rate limited',
      };
    }

    const key = rule.perAddress
      ? `per-function:${functionSelector}:${context.sender.toLowerCase()}`
      : `per-function:${functionSelector}`;

    const windowMs = rule.windowSeconds * 1000;
    const count = state.getExecutionCount(key, windowMs, context.timestamp);

    if (count >= rule.maxExecutions) {
      return {
        passed: false,
        ruleType: 'per-function',
        message: `Function rate limit exceeded: ${count}/${rule.maxExecutions}`,
        data: {
          functionSelector,
          count,
          maxExecutions: rule.maxExecutions,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'per-function',
      message: `Function rate limit OK: ${count + 1}/${rule.maxExecutions}`,
      data: { functionSelector, currentCount: count },
    };
  }
}
