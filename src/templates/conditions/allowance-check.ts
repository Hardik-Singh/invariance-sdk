/**
 * Allowance check condition checker.
 */

import type { AllowanceCheckCondition, VerificationContext, ComparisonOperator } from '@invariance/common';
import type { ConditionChecker, ConditionCheckResult } from './checker.js';

export interface AllowanceProofData {
  allowance: bigint;
  blockNumber?: number;
}

export class AllowanceCheckChecker implements ConditionChecker<AllowanceCheckCondition> {
  async check(
    condition: AllowanceCheckCondition,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<ConditionCheckResult> {
    if (!proof) {
      return {
        passed: false,
        conditionType: 'allowance-check',
        message: 'Allowance proof required',
        data: {
          token: condition.token,
          owner: condition.owner === 'sender' ? context.sender : condition.owner,
          spender: condition.spender,
        },
      };
    }

    const proofData = proof as AllowanceProofData;
    const passed = this.compare(proofData.allowance, condition.operator, condition.value);

    return {
      passed,
      conditionType: 'allowance-check',
      message: passed
        ? `Allowance sufficient: ${proofData.allowance} ${condition.operator} ${condition.value}`
        : `Insufficient allowance: ${proofData.allowance} ${condition.operator} ${condition.value}`,
      data: {
        allowance: proofData.allowance.toString(),
        required: condition.value.toString(),
        token: condition.token,
        spender: condition.spender,
      },
    };
  }

  private compare(a: bigint, op: ComparisonOperator, b: bigint): boolean {
    switch (op) {
      case 'eq': return a === b;
      case 'neq': return a !== b;
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
      default: return false;
    }
  }
}
