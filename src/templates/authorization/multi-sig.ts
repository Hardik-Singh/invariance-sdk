/**
 * Multi-signature authorization checker.
 */

import type { MultiSigAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for multi-sig verification.
 */
export interface MultiSigProofData {
  /** Array of signatures */
  signatures: Array<{
    signer: string;
    signature: string;
  }>;
  /** Timestamp when signatures were collected */
  collectionTimestamp?: number;
}

/**
 * Checks multi-signature authorization.
 */
export class MultiSigChecker implements AuthorizationChecker<MultiSigAuthorization> {
  async check(
    rule: MultiSigAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    if (!proof) {
      return {
        passed: false,
        ruleType: 'multi-sig',
        message: `Multi-sig proof required: need ${rule.requiredSignatures} of ${rule.signers.length} signatures`,
      };
    }

    const proofData = proof as MultiSigProofData;

    if (!proofData.signatures || proofData.signatures.length === 0) {
      return {
        passed: false,
        ruleType: 'multi-sig',
        message: 'No signatures provided',
      };
    }

    // Check collection window if specified
    if (rule.collectionWindow && proofData.collectionTimestamp) {
      const elapsed = context.timestamp - proofData.collectionTimestamp;
      if (elapsed > rule.collectionWindow * 1000) {
        return {
          passed: false,
          ruleType: 'multi-sig',
          message: `Signatures expired: collected ${elapsed / 1000}s ago, window is ${rule.collectionWindow}s`,
        };
      }
    }

    // Count valid signatures from authorized signers
    const validSigners = new Set<string>();
    const normalizedSigners = rule.signers.map((s) => s.toLowerCase());

    for (const sig of proofData.signatures) {
      const normalizedSigner = sig.signer.toLowerCase();
      if (normalizedSigners.includes(normalizedSigner)) {
        validSigners.add(normalizedSigner);
      }
    }

    const validCount = validSigners.size;
    const passed = validCount >= rule.requiredSignatures;

    return {
      passed,
      ruleType: 'multi-sig',
      message: passed
        ? `Multi-sig verified: ${validCount}/${rule.requiredSignatures} required signatures`
        : `Insufficient signatures: ${validCount}/${rule.requiredSignatures} required`,
      data: {
        validSignatures: validCount,
        requiredSignatures: rule.requiredSignatures,
        totalSigners: rule.signers.length,
        validSigners: Array.from(validSigners),
      },
    };
  }
}
