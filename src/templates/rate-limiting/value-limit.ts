/**
 * Value rate limiter.
 */

import type { ValueRateLimit, VerificationContext } from '@invariance/common';
import type { RateLimitChecker, RateLimitCheckResult, RateLimitState } from './checker.js';

export class ValueRateLimiter implements RateLimitChecker<ValueRateLimit> {
  async check(
    rule: ValueRateLimit,
    context: VerificationContext,
    state?: RateLimitState,
  ): Promise<RateLimitCheckResult> {
    const value = context.value ?? 0n;

    // Check per-transaction limit
    if (rule.maxPerTx && value > rule.maxPerTx) {
      return {
        passed: false,
        ruleType: 'value-limit',
        message: `Transaction value exceeds limit: ${value} > ${rule.maxPerTx}`,
        data: {
          value: value.toString(),
          maxPerTx: rule.maxPerTx.toString(),
        },
      };
    }

    if (!state) {
      return { passed: true, ruleType: 'value-limit', message: 'No state' };
    }

    const key = rule.scope === 'per-address'
      ? `value:${rule.token}:${context.sender.toLowerCase()}`
      : `value:${rule.token}:global`;

    const currentTotal = state.getValueTotal(key);
    const newTotal = currentTotal + value;

    if (newTotal > rule.maxValue) {
      return {
        passed: false,
        ruleType: 'value-limit',
        message: `Value limit exceeded: ${newTotal} > ${rule.maxValue}`,
        data: {
          currentTotal: currentTotal.toString(),
          transactionValue: value.toString(),
          newTotal: newTotal.toString(),
          maxValue: rule.maxValue.toString(),
        },
      };
    }

    return {
      passed: true,
      ruleType: 'value-limit',
      message: 'Value within limit',
      data: {
        newTotal: newTotal.toString(),
        maxValue: rule.maxValue.toString(),
      },
    };
  }
}
