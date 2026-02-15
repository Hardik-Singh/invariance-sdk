/**
 * Setup crews with shared budgets and per-role policies.
 *
 * @example
 * ```typescript
 * const composer = new MultiAgentComposer(inv);
 * const crew = await composer.setupCrew({
 *   name: 'research-crew',
 *   budget: '5000',
 *   roles: [
 *     { name: 'researcher', rules: [], allowedActions: ['query', 'analyze'] },
 *     { name: 'executor', rules: [], allowedActions: ['swap', 'transfer'], maxSpend: '1000' },
 *   ],
 *   members: [
 *     { identity: { type: 'agent', owner: '0xDev', label: 'R-1' }, role: 'researcher' },
 *   ],
 *   signers: ['0xSigner1', '0xSigner2'],
 *   threshold: 2,
 * });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';
import type { Identity } from '../modules/identity/types.js';
import type { SpecPolicy, PolicyRule } from '@invariance/common';
import type { EscrowContract } from '../modules/escrow/types.js';

/** Role definition for a crew member */
export interface CrewRole {
  /** Role identifier (e.g., 'researcher', 'executor', 'reviewer') */
  name: string;
  /** Policy rules specific to this role */
  rules: PolicyRule[];
  /** Optional spending limit override for this role */
  maxSpend?: string;
  /** Allowed actions for this role */
  allowedActions?: string[];
}

/** Agent to register as part of a crew */
export interface CrewMember {
  /** Identity registration options */
  identity: {
    type: 'agent' | 'human' | 'device' | 'service';
    owner: string;
    label: string;
    metadata?: Record<string, unknown>;
  };
  /** Role name from the crew's role definitions */
  role: string;
}

/** Options for setting up a crew */
export interface SetupCrewOptions {
  /** Crew name */
  name: string;
  /** Shared budget amount in USDC */
  budget: string;
  /** Role definitions */
  roles: CrewRole[];
  /** Members to register */
  members: CrewMember[];
  /** Multi-sig signers for budget release */
  signers: string[];
  /** Required signatures for budget release */
  threshold: number;
  /** Budget escrow timeout (ISO 8601 duration, default: P30D) */
  timeout?: string;
  /** Shared policy rules that apply to ALL members */
  sharedRules?: PolicyRule[];
}

/** Result of crew setup */
export interface CrewSetupResult {
  /** Crew identifier */
  crewId: string;
  /** Registered member identities */
  members: Array<{
    identity: Identity;
    role: string;
    policy: SpecPolicy;
  }>;
  /** Shared budget escrow */
  escrow: EscrowContract;
  /** Shared policy (applied to all members) */
  sharedPolicy: SpecPolicy;
}

/**
 * MultiAgentComposer — orchestrate agent crews with shared budgets and role-based policies.
 */
export class MultiAgentComposer {
  private readonly client: Invariance;

  constructor(client: Invariance) {
    this.client = client;
  }

  /**
   * Register a crew of agents with shared budget and role-based policies.
   */
  async setupCrew(opts: SetupCrewOptions): Promise<CrewSetupResult> {
    const roleMap = new Map(opts.roles.map((r) => [r.name, r]));
    for (const member of opts.members) {
      if (!roleMap.has(member.role)) {
        throw new Error(
          `Unknown role '${member.role}' for member '${member.identity.label}'. Available: ${opts.roles.map((r) => r.name).join(', ')}`,
        );
      }
    }

    // Create shared policy
    const sharedRules: PolicyRule[] = [
      { type: 'max-spend', config: { amount: opts.budget, period: '24h' } },
      ...(opts.sharedRules ?? []),
    ];
    const sharedPolicy = await this.client.policy.create({
      name: `${opts.name}-shared`,
      rules: sharedRules,
    });

    // Create multi-sig escrow for shared budget
    const escrow = await this.client.createMultiSig({
      amount: opts.budget,
      recipient: { type: 'agent', address: opts.signers[0] },
      signers: opts.signers,
      threshold: opts.threshold,
      timeout: opts.timeout ?? 'P30D',
    });

    // Register each member with role-specific policy
    const members: CrewSetupResult['members'] = [];
    for (const member of opts.members) {
      const role = roleMap.get(member.role)!;
      const roleRules: PolicyRule[] = [...role.rules];
      if (role.maxSpend) {
        roleRules.push({ type: 'max-spend', config: { amount: role.maxSpend, period: '24h' } });
      }
      if (role.allowedActions) {
        roleRules.push({ type: 'action-whitelist', config: { actions: role.allowedActions } });
      }

      const identity = await this.client.identity.register(member.identity);
      const rolePolicy = await this.client.policy.create({
        name: `${opts.name}-${member.role}-${member.identity.label}`,
        rules: roleRules,
      });

      await this.client.policy.attach(sharedPolicy.policyId, identity.identityId);
      await this.client.policy.attach(rolePolicy.policyId, identity.identityId);
      members.push({ identity, role: member.role, policy: rolePolicy });
    }

    return {
      crewId: `crew-${opts.name}-${Date.now()}`,
      members,
      escrow,
      sharedPolicy,
    };
  }

  /**
   * Add a new member to an existing crew.
   */
  async addMember(
    crewSharedPolicyId: string,
    member: CrewMember,
    role: CrewRole,
    crewName: string,
  ): Promise<{ identity: Identity; policy: SpecPolicy }> {
    const identity = await this.client.identity.register(member.identity);
    const roleRules: PolicyRule[] = [...role.rules];
    if (role.maxSpend) {
      roleRules.push({ type: 'max-spend', config: { amount: role.maxSpend, period: '24h' } });
    }
    if (role.allowedActions) {
      roleRules.push({ type: 'action-whitelist', config: { actions: role.allowedActions } });
    }

    const policy = await this.client.policy.create({
      name: `${crewName}-${member.role}-${member.identity.label}`,
      rules: roleRules,
    });

    await this.client.policy.attach(crewSharedPolicyId, identity.identityId);
    await this.client.policy.attach(policy.policyId, identity.identityId);
    return { identity, policy };
  }
}
