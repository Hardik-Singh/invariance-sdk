/**
 * Gas rate limiter.
 */

import type { GasRateLimit, VerificationContext } from '@invariance/common';
import type { RateLimitChecker, RateLimitCheckResult, RateLimitState } from './checker.js';

export class GasRateLimiter implements RateLimitChecker<GasRateLimit> {
  async check(
    rule: GasRateLimit,
    context: VerificationContext,
    state?: RateLimitState,
  ): Promise<RateLimitCheckResult> {
    const estimatedGas = (context.data?.['estimatedGas'] as bigint) ?? 0n;

    // Check per-transaction gas limit
    if (rule.maxGasPerTx && estimatedGas > rule.maxGasPerTx) {
      return {
        passed: false,
        ruleType: 'gas-limit',
        message: `Transaction gas exceeds limit: ${estimatedGas} > ${rule.maxGasPerTx}`,
        data: {
          estimatedGas: estimatedGas.toString(),
          maxGasPerTx: rule.maxGasPerTx.toString(),
        },
      };
    }

    if (!state) {
      return { passed: true, ruleType: 'gas-limit', message: 'No state' };
    }

    const key = rule.scope === 'per-address'
      ? `gas:${context.sender.toLowerCase()}`
      : 'gas:global';

    const currentTotal = state.getGasTotal(key);
    const newTotal = currentTotal + estimatedGas;

    if (newTotal > rule.maxGas) {
      return {
        passed: false,
        ruleType: 'gas-limit',
        message: `Gas limit exceeded: ${newTotal} > ${rule.maxGas}`,
        data: {
          currentTotal: currentTotal.toString(),
          estimatedGas: estimatedGas.toString(),
          maxGas: rule.maxGas.toString(),
        },
      };
    }

    return {
      passed: true,
      ruleType: 'gas-limit',
      message: 'Gas within limit',
      data: {
        newTotal: newTotal.toString(),
        maxGas: rule.maxGas.toString(),
      },
    };
  }
}
