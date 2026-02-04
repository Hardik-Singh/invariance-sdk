/**
 * Role-based authorization checker.
 */

import type { RoleBasedAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for role verification.
 */
export interface RoleProofData {
  /** Whether the account has the role */
  hasRole: boolean;
  /** Role name (for display) */
  roleName?: string;
}

/**
 * Checks role-based authorization.
 */
export class RoleBasedChecker implements AuthorizationChecker<RoleBasedAuthorization> {
  async check(
    rule: RoleBasedAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    if (proof) {
      const proofData = proof as RoleProofData;

      return {
        passed: proofData.hasRole,
        ruleType: 'role-based',
        message: proofData.hasRole
          ? `Has required role: ${proofData.roleName ?? rule.role}`
          : `Missing required role: ${proofData.roleName ?? rule.role}`,
        data: {
          role: rule.role,
          roleManager: rule.roleManager,
          account: context.sender,
        },
      };
    }

    // Without proof, need on-chain verification
    return {
      passed: false,
      ruleType: 'role-based',
      message: 'Role verification required',
      data: {
        role: rule.role,
        roleManager: rule.roleManager,
        account: context.sender,
      },
    };
  }
}
