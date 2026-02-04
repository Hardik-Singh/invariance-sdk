/**
 * Per-address rate limiter.
 */

import type { PerAddressRateLimit, VerificationContext } from '@invariance/common';
import type { RateLimitChecker, RateLimitCheckResult, RateLimitState } from './checker.js';

export class PerAddressRateLimiter implements RateLimitChecker<PerAddressRateLimit> {
  async check(
    rule: PerAddressRateLimit,
    context: VerificationContext,
    state?: RateLimitState,
  ): Promise<RateLimitCheckResult> {
    if (!state) {
      return {
        passed: true,
        ruleType: 'per-address',
        message: 'No rate limit state - allowing',
      };
    }

    // Determine which address to track
    let address: string;
    switch (rule.addressType) {
      case 'sender':
        address = context.sender;
        break;
      case 'origin':
        address = (context.data?.['origin'] as string) ?? context.sender;
        break;
      case 'recipient':
        address = (context.data?.['recipient'] as string) ?? context.sender;
        break;
      default:
        address = context.sender;
    }

    const key = `per-address:${address.toLowerCase()}`;
    const windowMs = rule.windowSeconds * 1000;
    const count = state.getExecutionCount(key, windowMs, context.timestamp);

    if (count >= rule.maxExecutions) {
      return {
        passed: false,
        ruleType: 'per-address',
        message: `Rate limit exceeded: ${count}/${rule.maxExecutions} in ${rule.windowSeconds}s`,
        data: {
          address,
          count,
          maxExecutions: rule.maxExecutions,
          windowSeconds: rule.windowSeconds,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'per-address',
      message: `Rate limit OK: ${count + 1}/${rule.maxExecutions}`,
      data: {
        address,
        currentCount: count,
        maxExecutions: rule.maxExecutions,
      },
    };
  }
}
