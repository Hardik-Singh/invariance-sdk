/**
 * Liquidity check condition checker.
 */

import type { LiquidityCheckCondition, VerificationContext, ComparisonOperator } from '@invariance/common';
import type { ConditionChecker, ConditionCheckResult } from './checker.js';

export interface LiquidityProofData {
  value: bigint;
  blockNumber?: number;
}

export class LiquidityCheckChecker implements ConditionChecker<LiquidityCheckCondition> {
  async check(
    condition: LiquidityCheckCondition,
    _context: VerificationContext,
    proof?: unknown,
  ): Promise<ConditionCheckResult> {
    if (!proof) {
      return {
        passed: false,
        conditionType: 'liquidity-check',
        message: 'Liquidity proof required',
        data: {
          protocol: condition.protocol,
          poolContract: condition.poolContract,
          metric: condition.metric,
        },
      };
    }

    const proofData = proof as LiquidityProofData;
    const passed = this.compare(proofData.value, condition.operator, condition.value);

    return {
      passed,
      conditionType: 'liquidity-check',
      message: passed
        ? `Liquidity ${condition.metric} check passed`
        : `Insufficient liquidity: ${proofData.value} ${condition.operator} ${condition.value}`,
      data: {
        metric: condition.metric,
        value: proofData.value.toString(),
        required: condition.value.toString(),
        pool: condition.poolContract,
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
