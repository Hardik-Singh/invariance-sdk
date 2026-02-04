/**
 * Price check condition checker.
 */

import type { PriceCheckCondition, VerificationContext, ComparisonOperator } from '@invariance/common';
import type { ConditionChecker, ConditionCheckResult } from './checker.js';

export interface PriceProofData {
  price: bigint;
  timestamp: number;
  roundId?: string;
}

export class PriceCheckChecker implements ConditionChecker<PriceCheckCondition> {
  async check(
    condition: PriceCheckCondition,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<ConditionCheckResult> {
    if (!proof) {
      return {
        passed: false,
        conditionType: 'price-check',
        message: 'Price proof required',
        data: {
          token: condition.token,
          oracle: condition.oracle,
          oracleContract: condition.oracleContract,
        },
      };
    }

    const proofData = proof as PriceProofData;

    // Check price data freshness
    const age = context.timestamp - proofData.timestamp;
    if (age > condition.maxAge * 1000) {
      return {
        passed: false,
        conditionType: 'price-check',
        message: `Price data stale: ${age / 1000}s old, max ${condition.maxAge}s`,
        data: {
          priceAge: age / 1000,
          maxAge: condition.maxAge,
        },
      };
    }

    const passed = this.compare(proofData.price, condition.operator, condition.value);

    return {
      passed,
      conditionType: 'price-check',
      message: passed
        ? `Price check passed: ${proofData.price} ${condition.operator} ${condition.value}`
        : `Price check failed: ${proofData.price} ${condition.operator} ${condition.value}`,
      data: {
        price: proofData.price.toString(),
        required: condition.value.toString(),
        token: condition.token,
        oracle: condition.oracle,
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
