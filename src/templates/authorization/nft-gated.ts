/**
 * NFT-gated authorization checker.
 */

import type { NFTGatedAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for NFT ownership verification.
 */
export interface NFTOwnershipProofData {
  /** Whether the address owns an NFT from the collection */
  ownsNFT: boolean;
  /** Specific token IDs owned (optional) */
  tokenIds?: bigint[];
  /** Balance for ERC1155 */
  balance?: number;
}

/**
 * Checks NFT-gated authorization.
 */
export class NFTGatedChecker implements AuthorizationChecker<NFTGatedAuthorization> {
  async check(
    rule: NFTGatedAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    if (proof) {
      const proofData = proof as NFTOwnershipProofData;

      // Check minimum balance requirement
      const minBalance = rule.minBalance ?? 1;
      const currentBalance = proofData.balance ?? (proofData.ownsNFT ? 1 : 0);

      if (currentBalance < minBalance) {
        return {
          passed: false,
          ruleType: 'nft-gated',
          message: `Insufficient NFT balance: ${currentBalance} < ${minBalance}`,
          data: {
            nftContract: rule.nftContract,
            balance: currentBalance,
            minRequired: minBalance,
          },
        };
      }

      // Check specific token ID if required
      if (rule.tokenId !== undefined) {
        const hasToken = proofData.tokenIds?.includes(rule.tokenId);
        if (!hasToken) {
          return {
            passed: false,
            ruleType: 'nft-gated',
            message: `Does not own required token ID: ${rule.tokenId}`,
            data: {
              nftContract: rule.nftContract,
              requiredTokenId: rule.tokenId.toString(),
              ownedTokenIds: proofData.tokenIds?.map((t) => t.toString()),
            },
          };
        }
      }

      return {
        passed: true,
        ruleType: 'nft-gated',
        message: 'NFT ownership verified',
        data: {
          nftContract: rule.nftContract,
          balance: currentBalance,
        },
      };
    }

    // Without proof, need on-chain verification
    return {
      passed: false,
      ruleType: 'nft-gated',
      message: 'NFT ownership proof required',
      data: {
        nftContract: rule.nftContract,
        standard: rule.standard,
        account: context.sender,
      },
    };
  }
}
