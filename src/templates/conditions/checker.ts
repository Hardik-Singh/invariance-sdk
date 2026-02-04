/**
 * Condition checker dispatcher.
 */

import type { StateCondition, VerificationContext } from '@invariance/common';
import { BalanceCheckChecker } from './balance-check.js';
import { AllowanceCheckChecker } from './allowance-check.js';
import { StateEqualsChecker } from './state-equals.js';
import { PositionCheckChecker } from './position-check.js';
import { PriceCheckChecker } from './price-check.js';
import { LiquidityCheckChecker } from './liquidity-check.js';
import { CustomCheckChecker } from './custom-check.js';

/**
 * Result of a condition check.
 */
export interface ConditionCheckResult {
  /** Whether condition passed */
  passed: boolean;
  /** Condition type that was checked */
  conditionType: string;
  /** Message describing the result */
  message?: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Interface for condition checker implementations.
 */
export interface ConditionChecker<T extends StateCondition = StateCondition> {
  check(condition: T, context: VerificationContext, proof?: unknown): Promise<ConditionCheckResult>;
}

/**
 * Check a state condition against context.
 */
export async function checkCondition(
  condition: StateCondition,
  context: VerificationContext,
  proof?: unknown,
): Promise<ConditionCheckResult> {
  switch (condition.type) {
    case 'balance-check': {
      const checker = new BalanceCheckChecker();
      return checker.check(condition, context, proof);
    }
    case 'allowance-check': {
      const checker = new AllowanceCheckChecker();
      return checker.check(condition, context, proof);
    }
    case 'state-equals': {
      const checker = new StateEqualsChecker();
      return checker.check(condition, context, proof);
    }
    case 'position-check': {
      const checker = new PositionCheckChecker();
      return checker.check(condition, context, proof);
    }
    case 'price-check': {
      const checker = new PriceCheckChecker();
      return checker.check(condition, context, proof);
    }
    case 'liquidity-check': {
      const checker = new LiquidityCheckChecker();
      return checker.check(condition, context, proof);
    }
    case 'custom-check': {
      const checker = new CustomCheckChecker();
      return checker.check(condition, context, proof);
    }
    default: {
      return {
        passed: false,
        conditionType: 'unknown',
        message: `Unknown condition type: ${(condition as StateCondition).type}`,
      };
    }
  }
}
