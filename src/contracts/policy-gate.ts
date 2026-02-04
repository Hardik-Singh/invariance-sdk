import type { ContractAddresses, ActionCategory } from '@invariance/common';

/**
 * Result of an on-chain policy check.
 */
export interface PolicyCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for denial (if any) */
  reason?: string;
}

/**
 * Interface for PolicyGate contract.
 */
export interface PolicyGateContract {
  /**
   * Check if an action is permitted for an agent.
   *
   * @param agentAddress - The agent's address
   * @param category - The action category
   * @param params - Encoded action parameters
   * @param value - Value being moved (in wei)
   * @param gas - Gas being used
   * @returns Policy check result
   */
  checkPolicy(
    agentAddress: string,
    category: ActionCategory,
    params: Uint8Array,
    value: bigint,
    gas: bigint,
  ): Promise<PolicyCheckResult>;

  /**
   * Get remaining cooldown for an agent/category pair.
   *
   * @param agentAddress - The agent's address
   * @param category - The action category
   * @returns Remaining cooldown in seconds
   */
  getCooldownRemaining(
    agentAddress: string,
    category: ActionCategory,
  ): Promise<number>;
}

/**
 * Wrapper for the PolicyGate contract.
 */
export class PolicyGate implements PolicyGateContract {
  /** @internal */
  readonly contractAddress: string;
  /** @internal */
  readonly rpcUrl: string;

  constructor(addresses: ContractAddresses, rpcUrl: string) {
    this.contractAddress = addresses.permissionGate; // Same contract, renamed
    this.rpcUrl = rpcUrl;
  }

  /**
   * Check if an action is permitted on-chain.
   */
  async checkPolicy(
    _agentAddress: string,
    _category: ActionCategory,
    _params: Uint8Array,
    _value: bigint,
    _gas: bigint,
  ): Promise<PolicyCheckResult> {
    // TODO(high): @agent Implement on-chain policy check
    // Context: Call PolicyGate.checkPolicy(agent, category, params, value, gas)
    // AC: Return PolicyCheckResult from contract call
    throw new Error('Not implemented');
  }

  /**
   * Get remaining cooldown for an agent/category pair.
   */
  async getCooldownRemaining(
    _agentAddress: string,
    _category: ActionCategory,
  ): Promise<number> {
    // TODO(high): @agent Implement cooldown check
    // Context: Call PolicyGate.getCooldownRemaining(agent, category)
    // AC: Return remaining seconds from contract call
    throw new Error('Not implemented');
  }
}

// ============================================================================
// Backward Compatibility
// ============================================================================

/**
 * @deprecated Use PolicyGateContract instead
 */
export type PermissionGateContract = {
  checkPermission(
    agentAddress: string,
    action: string,
    params: Uint8Array,
  ): Promise<boolean>;
};

/**
 * @deprecated Use PolicyGate instead
 */
export class PermissionGate implements PermissionGateContract {
  private readonly policyGate: PolicyGate;

  constructor(addresses: ContractAddresses, rpcUrl: string) {
    this.policyGate = new PolicyGate(addresses, rpcUrl);
  }

  /**
   * @deprecated Use PolicyGate.checkPolicy instead
   */
  async checkPermission(
    agentAddress: string,
    _action: string,
    params: Uint8Array,
  ): Promise<boolean> {
    const result = await this.policyGate.checkPolicy(
      agentAddress,
      'CUSTOM',
      params,
      0n,
      0n,
    );
    return result.allowed;
  }
}
