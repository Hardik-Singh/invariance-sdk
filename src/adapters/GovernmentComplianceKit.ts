/**
 * Role-based procurement + benefits distribution.
 * Serves: DOGE, government procurement, benefits distribution programs.
 *
 * @example
 * ```typescript
 * const gov = new GovernmentComplianceKit(inv);
 * const agency = await gov.setupAgency({
 *   name: 'DOT',
 *   identity: { type: 'service', owner: '0xGov', label: 'Dept-of-Transportation' },
 *   roles: [
 *     { name: 'officer', maxSpend: '100000', allowedActions: ['approve', 'procure', 'audit'] },
 *     { name: 'vendor', maxSpend: '0', allowedActions: ['bid', 'deliver', 'invoice'] },
 *   ],
 *   agencyCap: '10000000',
 * });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';
import type { Identity } from '../modules/identity/types.js';
import type { SpecPolicy, PolicyRule } from '@invariance/common';
import type { EscrowContract } from '../modules/escrow/types.js';

/** Agency role with permission matrix */
export interface AgencyRole {
  /** Role name (e.g., 'procurement-officer', 'auditor', 'vendor') */
  name: string;
  /** Maximum spending authority */
  maxSpend: string;
  /** Allowed actions */
  allowedActions: string[];
  /** Approval required above this amount */
  approvalThreshold?: string;
}

/** Options for setting up an agency */
export interface SetupAgencyOptions {
  /** Agency name */
  name: string;
  /** Agency identity details */
  identity: {
    type: 'service';
    owner: string;
    label: string;
    metadata?: Record<string, unknown>;
  };
  /** Role definitions */
  roles: AgencyRole[];
  /** Agency-wide spending cap */
  agencyCap: string;
}

/** Agency setup result */
export interface AgencySetupResult {
  /** Agency identity */
  identity: Identity;
  /** Agency-wide policy */
  policy: SpecPolicy;
  /** Role policies */
  rolePolicies: Map<string, SpecPolicy>;
}

/** Milestone for escrow release */
export interface Milestone {
  /** Milestone description */
  description: string;
  /** Amount to release on completion */
  amount: string;
  /** Verifier identity ID */
  verifier: string;
}

/** Milestone escrow result */
export interface MilestoneEscrowResult {
  /** Created escrow */
  escrow: EscrowContract;
  /** Policy for milestone verification */
  policy: SpecPolicy;
  /** Milestones registered */
  milestones: Milestone[];
}

/** Benefits distribution options */
export interface DistributeBenefitsOptions {
  /** Program name */
  program: string;
  /** Recipient identity IDs */
  recipients: string[];
  /** Amount per recipient */
  amountPerRecipient: string;
  /** Maximum total distribution */
  maxTotal: string;
  /** Require eligibility verification */
  requireEligibility?: boolean;
}

/** Distribution result */
export interface DistributionResult {
  /** Number of successful distributions */
  successCount: number;
  /** Total amount distributed */
  totalDistributed: string;
  /** Ledger entries for audit trail */
  auditEntries: string[];
  /** Failed distributions */
  failures: Array<{ recipientId: string; reason: string }>;
}

/**
 * GovernmentComplianceKit — role-based procurement + benefits distribution.
 */
export class GovernmentComplianceKit {
  private readonly client: Invariance;

  constructor(client: Invariance) {
    this.client = client;
  }

  /**
   * Register an agency identity with role-based permission matrix.
   */
  async setupAgency(opts: SetupAgencyOptions): Promise<AgencySetupResult> {
    const { metadata, ...restIdentity } = opts.identity;
    const identityMetadata = metadata
      ? Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)]))
      : undefined;

    const identity = await this.client.identity.register(
      identityMetadata ? { ...restIdentity, metadata: identityMetadata } : { ...restIdentity },
    );

    const policy = await this.client.policy.create({
      name: `agency-${opts.name}`,
      rules: [{ type: 'max-spend', config: { amount: opts.agencyCap, period: '24h' } }],
    });

    await this.client.policy.attach(policy.policyId, identity.identityId);

    const rolePolicies = new Map<string, SpecPolicy>();
    for (const role of opts.roles) {
      const roleRules: PolicyRule[] = [
        { type: 'max-spend', config: { amount: role.maxSpend, period: '24h' } },
        { type: 'action-whitelist', config: { actions: role.allowedActions } },
      ];

      const rolePolicy = await this.client.policy.create({
        name: `agency-${opts.name}-role-${role.name}`,
        rules: roleRules,
      });

      rolePolicies.set(role.name, rolePolicy);
    }

    return { identity, policy, rolePolicies };
  }

  /**
   * Create milestone-based escrow for procurement contracts.
   */
  async milestoneEscrow(
    contractName: string,
    totalAmount: string,
    milestones: Milestone[],
    signers: string[],
    threshold: number,
  ): Promise<MilestoneEscrowResult> {
    if (!signers.length) {
      throw new Error('signers array must contain at least one signer');
    }
    const primarySigner = signers[0]!;

    const escrow = await this.client.createMultiSig({
      amount: totalAmount,
      recipient: { type: 'service', address: primarySigner },
      signers,
      threshold,
      timeout: 'P90D',
    });

    const policy = await this.client.policy.create({
      name: `procurement-${contractName}`,
      rules: [
        { type: 'max-spend', config: { amount: totalAmount } },
        { type: 'action-whitelist', config: { actions: ['verify-milestone', 'release', 'audit'] } },
      ],
    });

    for (const milestone of milestones) {
      await this.client.ledger.log({
        action: 'milestone-registered',
        actor: { type: 'service' as const, address: primarySigner },
        category: 'custom',
        metadata: {
          contractName,
          escrowId: escrow.escrowId,
          milestone: milestone.description,
          amount: milestone.amount,
          verifier: milestone.verifier,
        },
      });
    }

    return { escrow, policy, milestones };
  }

  /**
   * Distribute benefits with eligibility gates and per-citizen caps.
   */
  async distributeBenefits(opts: DistributeBenefitsOptions): Promise<DistributionResult> {
    const auditEntries: string[] = [];
    const failures: DistributionResult['failures'] = [];
    let successCount = 0;
    let totalDistributed = 0;
    const perRecipient = parseFloat(opts.amountPerRecipient);
    const maxTotal = parseFloat(opts.maxTotal);

    for (const recipientId of opts.recipients) {
      if (totalDistributed + perRecipient > maxTotal) {
        failures.push({ recipientId, reason: 'Maximum total distribution reached' });
        continue;
      }

      try {
        if (opts.requireEligibility) {
          await this.client.identity.get(recipientId);
        }

        const entry = await this.client.ledger.log({
          action: 'benefits-distribution',
          actor: { type: 'service' as const, address: recipientId },
          category: 'custom',
          metadata: {
            program: opts.program,
            recipientId,
            amount: opts.amountPerRecipient,
            distributedAt: Date.now(),
          },
        });

        auditEntries.push(entry.entryId);
        successCount++;
        totalDistributed += perRecipient;
      } catch (error) {
        failures.push({
          recipientId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      successCount,
      totalDistributed: totalDistributed.toString(),
      auditEntries,
      failures,
    };
  }

  /**
   * Create immutable compliance attestation.
   */
  async complianceAttestation(
    agencyIdentityId: string,
    regulation: string,
    details: Record<string, unknown>,
  ): Promise<{ txHash: string }> {
    const attestation = await this.client.identity.attest(agencyIdentityId, {
      claim: `compliance:${regulation}`,
      attester: agencyIdentityId,
      evidence: JSON.stringify({ regulation, attestedAt: Date.now(), ...details }),
    });

    return { txHash: attestation.txHash };
  }
}
