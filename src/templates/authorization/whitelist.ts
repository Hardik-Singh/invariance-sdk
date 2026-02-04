/**
 * Whitelist authorization checker.
 */

import type { WhitelistAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for merkle whitelist verification.
 */
export interface WhitelistProofData {
  /** Merkle proof for the address */
  merkleProof?: string[];
}

/**
 * Checks whitelist authorization.
 */
export class WhitelistChecker implements AuthorizationChecker<WhitelistAuthorization> {
  async check(
    rule: WhitelistAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    const sender = context.sender.toLowerCase();

    // Check direct address list
    if (rule.addresses && rule.addresses.length > 0) {
      const normalizedAddresses = rule.addresses.map((a) => a.toLowerCase());
      const isWhitelisted = normalizedAddresses.includes(sender);

      if (isWhitelisted) {
        return {
          passed: true,
          ruleType: 'whitelist',
          message: 'Address is whitelisted',
          data: { address: context.sender },
        };
      }
    }

    // Check merkle proof if provided
    if (rule.merkleRoot && proof) {
      const proofData = proof as WhitelistProofData;
      if (proofData.merkleProof) {
        const isValid = await this.verifyMerkleProof(
          sender,
          rule.merkleRoot,
          proofData.merkleProof,
        );

        if (isValid) {
          return {
            passed: true,
            ruleType: 'whitelist',
            message: 'Merkle proof verified',
            data: { address: context.sender },
          };
        }
      }
    }

    return {
      passed: false,
      ruleType: 'whitelist',
      message: 'Address not whitelisted',
      data: { address: context.sender },
    };
  }

  /**
   * Verify a merkle proof.
   * Note: Simplified implementation. Use a proper merkle library in production.
   */
  private async verifyMerkleProof(
    _leaf: string,
    _root: string,
    _proof: string[],
  ): Promise<boolean> {
    // In production, use @openzeppelin/merkle-tree or similar
    return false;
  }
}
