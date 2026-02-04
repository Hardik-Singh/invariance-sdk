/**
 * Rate limit checker dispatcher.
 */

import type { RateLimitRule, VerificationContext } from '@invariance/common';
import { PerAddressRateLimiter } from './per-address.js';
import { PerFunctionRateLimiter } from './per-function.js';
import { GlobalRateLimiter } from './global-limit.js';
import { ValueRateLimiter } from './value-limit.js';
import { GasRateLimiter } from './gas-limit.js';
import { ProgressiveRateLimiter } from './progressive-limit.js';
import { ReputationRateLimiter } from './reputation-based.js';

/**
 * Result of a rate limit check.
 */
export interface RateLimitCheckResult {
  passed: boolean;
  ruleType: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Interface for rate limit checker implementations.
 */
export interface RateLimitChecker<T extends RateLimitRule = RateLimitRule> {
  check(rule: T, context: VerificationContext, state?: RateLimitState): Promise<RateLimitCheckResult>;
}

/**
 * State for rate limit tracking.
 */
export class RateLimitState {
  /** Execution timestamps per key */
  private executions: Map<string, number[]> = new Map();
  /** Value totals per key per window */
  private valueTotals: Map<string, bigint> = new Map();
  /** Gas totals per key per window */
  private gasTotals: Map<string, bigint> = new Map();
  /** Progressive limit levels per key */
  private progressiveLevels: Map<string, number> = new Map();

  /**
   * Get execution count within a window.
   */
  getExecutionCount(key: string, windowMs: number, now: number): number {
    const timestamps = this.executions.get(key) ?? [];
    const windowStart = now - windowMs;
    return timestamps.filter((t) => t >= windowStart).length;
  }

  /**
   * Record an execution.
   */
  recordExecution(key: string, timestamp: number): void {
    const timestamps = this.executions.get(key) ?? [];
    timestamps.push(timestamp);
    this.executions.set(key, timestamps);
  }

  /**
   * Get value total within a window.
   */
  getValueTotal(key: string): bigint {
    return this.valueTotals.get(key) ?? 0n;
  }

  /**
   * Add to value total.
   */
  addValue(key: string, amount: bigint): void {
    const current = this.valueTotals.get(key) ?? 0n;
    this.valueTotals.set(key, current + amount);
  }

  /**
   * Reset value total for a window.
   */
  resetValueTotal(key: string): void {
    this.valueTotals.set(key, 0n);
  }

  /**
   * Get gas total.
   */
  getGasTotal(key: string): bigint {
    return this.gasTotals.get(key) ?? 0n;
  }

  /**
   * Add to gas total.
   */
  addGas(key: string, amount: bigint): void {
    const current = this.gasTotals.get(key) ?? 0n;
    this.gasTotals.set(key, current + amount);
  }

  /**
   * Get progressive limit level.
   */
  getProgressiveLevel(key: string): number {
    return this.progressiveLevels.get(key) ?? 0;
  }

  /**
   * Set progressive limit level.
   */
  setProgressiveLevel(key: string, level: number): void {
    this.progressiveLevels.set(key, level);
  }

  /**
   * Clean old entries outside windows.
   */
  cleanup(maxWindowMs: number, now: number): void {
    const cutoff = now - maxWindowMs;
    for (const [key, timestamps] of this.executions.entries()) {
      const filtered = timestamps.filter((t) => t >= cutoff);
      if (filtered.length === 0) {
        this.executions.delete(key);
      } else {
        this.executions.set(key, filtered);
      }
    }
  }
}

/**
 * Check a rate limit rule against context.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  context: VerificationContext,
  state?: RateLimitState,
): Promise<RateLimitCheckResult> {
  switch (rule.type) {
    case 'per-address': {
      const checker = new PerAddressRateLimiter();
      return checker.check(rule, context, state);
    }
    case 'per-function': {
      const checker = new PerFunctionRateLimiter();
      return checker.check(rule, context, state);
    }
    case 'global-limit': {
      const checker = new GlobalRateLimiter();
      return checker.check(rule, context, state);
    }
    case 'value-limit': {
      const checker = new ValueRateLimiter();
      return checker.check(rule, context, state);
    }
    case 'gas-limit': {
      const checker = new GasRateLimiter();
      return checker.check(rule, context, state);
    }
    case 'progressive-limit': {
      const checker = new ProgressiveRateLimiter();
      return checker.check(rule, context, state);
    }
    case 'reputation-based': {
      const checker = new ReputationRateLimiter();
      return checker.check(rule, context, state);
    }
    default: {
      return {
        passed: false,
        ruleType: 'unknown',
        message: `Unknown rate limit type: ${(rule as RateLimitRule).type}`,
      };
    }
  }
}
