import type { ContractAddresses } from '@invariance/common';

/**
 * Interface for PermissionGate contract.
 */
export interface PermissionGateContract {
  /** Check if an action is permitted for an agent */
  checkPermission(
    agentAddress: string,
    action: string,
    params: Uint8Array,
  ): Promise<boolean>;
}

/**
 * Wrapper for the PermissionGate contract.
 */
export class PermissionGate implements PermissionGateContract {
  private readonly contractAddress: string;
  private readonly rpcUrl: string;

  constructor(addresses: ContractAddresses, rpcUrl: string) {
    this.contractAddress = addresses.permissionGate;
    this.rpcUrl = rpcUrl;
  }

  /**
   * Check if an action is permitted on-chain.
   */
  async checkPermission(
    _agentAddress: string,
    _action: string,
    _params: Uint8Array,
  ): Promise<boolean> {
    // TODO(high): @agent Implement on-chain permission check
    // Context: Call PermissionGate.checkPermission(agent, action, params)
    // AC: Return boolean from contract call
    throw new Error('Not implemented');
  }
}
