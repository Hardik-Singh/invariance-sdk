/**
 * Balance check condition checker.
 */

import type { BalanceCheckCondition, VerificationContext, ComparisonOperator } from '@invariance/common';
import type { ConditionChecker, ConditionCheckResult } from './checker.js';

/**
 * Proof data for balance verification.
 */
export interface BalanceProofData {
  balance: bigint;
  blockNumber?: number;
}

/**
 * Checks balance conditions.
 */
export class BalanceCheckChecker implements ConditionChecker<BalanceCheckCondition> {
  async check(
    condition: BalanceCheckCondition,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<ConditionCheckResult> {
    if (!proof) {
      return {
        passed: false,
        conditionType: 'balance-check',
        message: 'Balance proof required',
        data: {
          token: condition.token,
          account: condition.account === 'sender' ? context.sender : condition.account,
          operator: condition.operator,
          value: condition.value.toString(),
        },
      };
    }

    const proofData = proof as BalanceProofData;
    const passed = this.compare(proofData.balance, condition.operator, condition.value);

    return {
      passed,
      conditionType: 'balance-check',
      message: passed
        ? `Balance check passed: ${proofData.balance} ${condition.operator} ${condition.value}`
        : `Balance check failed: ${proofData.balance} ${condition.operator} ${condition.value}`,
      data: {
        balance: proofData.balance.toString(),
        operator: condition.operator,
        required: condition.value.toString(),
        token: condition.token,
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
