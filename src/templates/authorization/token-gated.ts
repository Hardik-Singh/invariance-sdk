/**
 * Token-gated authorization checker.
 */

import type { TokenGatedAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for token balance verification.
 */
export interface TokenBalanceProofData {
  /** Current token balance */
  balance: bigint;
  /** Staked balance (if checking staked tokens) */
  stakedBalance?: bigint;
  /** Block number of the balance check */
  blockNumber?: number;
}

/**
 * Checks token-gated authorization.
 */
export class TokenGatedChecker implements AuthorizationChecker<TokenGatedAuthorization> {
  async check(
    rule: TokenGatedAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    // If proof provided, use it
    if (proof) {
      const proofData = proof as TokenBalanceProofData;
      let totalBalance = proofData.balance;

      if (rule.includeStaked && proofData.stakedBalance) {
        totalBalance += proofData.stakedBalance;
      }

      const passed = totalBalance >= rule.minBalance;

      return {
        passed,
        ruleType: 'token-gated',
        message: passed
          ? `Token balance sufficient: ${totalBalance} >= ${rule.minBalance}`
          : `Insufficient token balance: ${totalBalance} < ${rule.minBalance}`,
        data: {
          balance: totalBalance.toString(),
          minRequired: rule.minBalance.toString(),
          token: rule.tokenContract,
        },
      };
    }

    // Without proof, we need to check on-chain
    // In production, this would call the token contract
    return {
      passed: false,
      ruleType: 'token-gated',
      message: 'Token balance proof required for verification',
      data: {
        token: rule.tokenContract,
        minRequired: rule.minBalance.toString(),
        account: context.sender,
      },
    };
  }
}
