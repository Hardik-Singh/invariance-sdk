/**
 * Position check condition checker.
 */

import type { PositionCheckCondition, VerificationContext, ComparisonOperator } from '@invariance/common';
import type { ConditionChecker, ConditionCheckResult } from './checker.js';

export interface PositionProofData {
  value: bigint;
  positionId?: bigint;
  blockNumber?: number;
}

export class PositionCheckChecker implements ConditionChecker<PositionCheckCondition> {
  async check(
    condition: PositionCheckCondition,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<ConditionCheckResult> {
    if (!proof) {
      return {
        passed: false,
        conditionType: 'position-check',
        message: 'Position proof required',
        data: {
          protocol: condition.protocol,
          protocolContract: condition.protocolContract,
          positionType: condition.positionType,
          metric: condition.metric,
          account: condition.account === 'sender' ? context.sender : condition.account,
        },
      };
    }

    const proofData = proof as PositionProofData;
    const passed = this.compare(proofData.value, condition.operator, condition.value);

    return {
      passed,
      conditionType: 'position-check',
      message: passed
        ? `Position ${condition.metric} check passed`
        : `Position ${condition.metric} check failed: ${proofData.value} ${condition.operator} ${condition.value}`,
      data: {
        metric: condition.metric,
        value: proofData.value.toString(),
        required: condition.value.toString(),
        protocol: condition.protocol,
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
