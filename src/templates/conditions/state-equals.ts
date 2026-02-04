/**
 * State equals condition checker.
 */

import type { StateEqualsCondition, VerificationContext } from '@invariance/common';
import type { ConditionChecker, ConditionCheckResult } from './checker.js';

export interface StateProofData {
  value: string;
  blockNumber?: number;
}

export class StateEqualsChecker implements ConditionChecker<StateEqualsCondition> {
  async check(
    condition: StateEqualsCondition,
    _context: VerificationContext,
    proof?: unknown,
  ): Promise<ConditionCheckResult> {
    if (!proof) {
      return {
        passed: false,
        conditionType: 'state-equals',
        message: 'State proof required',
        data: {
          contract: condition.contract,
          slot: condition.slot,
          expectedValue: condition.expectedValue,
        },
      };
    }

    const proofData = proof as StateProofData;
    const passed = proofData.value === condition.expectedValue;

    return {
      passed,
      conditionType: 'state-equals',
      message: passed
        ? 'State matches expected value'
        : `State mismatch: expected ${condition.expectedValue}, got ${proofData.value}`,
      data: {
        contract: condition.contract,
        actualValue: proofData.value,
        expectedValue: condition.expectedValue,
      },
    };
  }
}
