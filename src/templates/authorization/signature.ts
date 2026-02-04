/**
 * Signature authorization checker.
 */

import type { SignatureAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for signature verification.
 */
export interface SignatureProofData {
  /** The signature */
  signature: string;
  /** The message that was signed */
  message?: string;
  /** Message hash */
  messageHash?: string;
}

/**
 * Checks signature authorization.
 */
export class SignatureChecker implements AuthorizationChecker<SignatureAuthorization> {
  /**
   * Check if signature authorization is satisfied.
   *
   * @param rule - The signature authorization rule
   * @param context - The verification context
   * @param proof - The signature proof data
   * @returns The check result
   */
  async check(
    rule: SignatureAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    // If no proof provided, check if sender matches signer
    if (!proof) {
      const senderMatch = context.sender.toLowerCase() === rule.signer.toLowerCase();
      if (senderMatch) {
        return {
          passed: true,
          ruleType: 'signature',
          message: 'Sender matches required signer',
        };
      }
      return {
        passed: false,
        ruleType: 'signature',
        message: 'Signature proof required',
      };
    }

    const proofData = proof as SignatureProofData;

    if (!proofData.signature) {
      return {
        passed: false,
        ruleType: 'signature',
        message: 'Missing signature in proof',
      };
    }

    // Verify the signature
    const recoveredAddress = await this.recoverSigner(
      proofData.signature,
      proofData.message ?? proofData.messageHash ?? '',
      rule.messageFormat ?? 'eip191',
    );

    if (!recoveredAddress) {
      return {
        passed: false,
        ruleType: 'signature',
        message: 'Failed to recover signer from signature',
      };
    }

    const isValid = recoveredAddress.toLowerCase() === rule.signer.toLowerCase();

    return {
      passed: isValid,
      ruleType: 'signature',
      message: isValid
        ? 'Signature verified successfully'
        : `Invalid signature: expected ${rule.signer}, got ${recoveredAddress}`,
      data: {
        expectedSigner: rule.signer,
        recoveredSigner: recoveredAddress,
      },
    };
  }

  /**
   * Recover signer address from signature.
   * Note: This is a simplified implementation. In production, use a proper
   * cryptographic library like viem or ethers.
   */
  private async recoverSigner(
    _signature: string,
    _message: string,
    _format: 'eip191' | 'eip712' | 'raw',
  ): Promise<string | null> {
    // In a real implementation, this would use viem's recoverMessageAddress
    // or similar to recover the signer from the signature.
    // For now, return null to indicate verification should be done externally.
    return null;
  }
}
