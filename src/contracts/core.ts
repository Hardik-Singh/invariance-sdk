import type { ContractAddresses } from '@invariance/common';

/**
 * Interface for InvarianceCore contract.
 */
export interface InvarianceCoreContract {
  /** Register an agent with a permission config */
  registerAgent(configHash: string): Promise<{ txHash: string }>;

  /** Get agent's config hash */
  getAgentConfig(agentAddress: string): Promise<string>;

  /** Check if an agent is registered */
  isAgentRegistered(agentAddress: string): Promise<boolean>;
}

/**
 * Wrapper for the InvarianceCore contract.
 */
export class InvarianceCore implements InvarianceCoreContract {
  private readonly contractAddress: string;
  private readonly rpcUrl: string;

  constructor(addresses: ContractAddresses, rpcUrl: string) {
    this.contractAddress = addresses.core;
    this.rpcUrl = rpcUrl;
  }

  /**
   * Register an agent with a permission config hash.
   */
  async registerAgent(_configHash: string): Promise<{ txHash: string }> {
    // TODO(high): @agent Implement agent registration
    // Context: Call InvarianceCore.registerAgent(configHash) on-chain
    // AC: Return transaction hash after successful registration
    throw new Error('Not implemented');
  }

  /**
   * Get the config hash for a registered agent.
   */
  async getAgentConfig(_agentAddress: string): Promise<string> {
    // TODO(medium): @agent Implement config retrieval
    // Context: Call InvarianceCore.agentConfigs(address) view function
    // AC: Return the bytes32 config hash as hex string
    throw new Error('Not implemented');
  }

  /**
   * Check if an agent is registered.
   */
  async isAgentRegistered(_agentAddress: string): Promise<boolean> {
    // TODO(medium): @agent Implement registration check
    // Context: Check if agentConfigs[address] is non-zero
    // AC: Return true if agent is registered, false otherwise
    throw new Error('Not implemented');
  }
}
