/**
 * Custom check condition checker.
 */

import type { CustomCheckCondition, VerificationContext } from '@invariance/common';
import type { ConditionChecker, ConditionCheckResult } from './checker.js';

export interface CustomCheckProofData {
  result: unknown;
  blockNumber?: number;
}

export class CustomCheckChecker implements ConditionChecker<CustomCheckCondition> {
  async check(
    condition: CustomCheckCondition,
    _context: VerificationContext,
    proof?: unknown,
  ): Promise<ConditionCheckResult> {
    if (!proof) {
      return {
        passed: false,
        conditionType: 'custom-check',
        message: 'Custom check proof required',
        data: {
          contract: condition.contract,
          functionSignature: condition.functionSignature,
        },
      };
    }

    const proofData = proof as CustomCheckProofData;

    // If expected return is specified, compare
    if (condition.expectedReturn !== undefined) {
      const passed = this.deepEqual(proofData.result, condition.expectedReturn);
      return {
        passed,
        conditionType: 'custom-check',
        message: passed
          ? 'Custom check passed'
          : 'Custom check failed: unexpected return value',
        data: {
          result: proofData.result,
          expected: condition.expectedReturn,
        },
      };
    }

    // If no expected return, treat truthy as pass
    const passed = Boolean(proofData.result);
    return {
      passed,
      conditionType: 'custom-check',
      message: passed ? 'Custom check passed' : 'Custom check returned falsy',
      data: { result: proofData.result },
    };
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object' && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }
}
