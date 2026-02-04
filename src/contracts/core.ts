import type {
  ContractAddresses,
  ActionId,
  IntentHash,
  ActionCategory,
} from '@invariance/common';

/**
 * Interface for InvarianceCore contract.
 */
export interface InvarianceCoreContract {
  /**
   * Register an agent with a policy config.
   *
   * @param policyHash - Hash of the policy configuration
   * @param policyVersion - Policy version (semver)
   * @returns Transaction hash
   */
  registerAgent(
    policyHash: string,
    policyVersion: string,
  ): Promise<{ txHash: string }>;

  /**
   * Log an action execution.
   *
   * @param actionId - Unique action identifier
   * @param intentHash - Intent hash for the action
   * @param category - Action category
   * @param valueMoved - Value moved (in wei)
   * @param gasUsed - Gas used for execution
   * @param success - Whether the action succeeded
   * @returns Transaction hash
   */
  logAction(
    actionId: ActionId,
    intentHash: IntentHash,
    category: ActionCategory,
    valueMoved: bigint,
    gasUsed: bigint,
    success: boolean,
  ): Promise<{ txHash: string }>;

  /** Get agent's policy hash */
  getAgentConfig(agentAddress: string): Promise<string>;

  /** Get agent's policy version */
  getAgentPolicyVersion(agentAddress: string): Promise<string>;

  /** Check if an agent is registered */
  isAgentRegistered(agentAddress: string): Promise<boolean>;
}

/**
 * Wrapper for the InvarianceCore contract.
 */
export class InvarianceCore implements InvarianceCoreContract {
  /** @internal */
  readonly contractAddress: string;
  /** @internal */
  readonly rpcUrl: string;

  constructor(addresses: ContractAddresses, rpcUrl: string) {
    this.contractAddress = addresses.core;
    this.rpcUrl = rpcUrl;
  }

  /**
   * Register an agent with a policy config hash.
   */
  async registerAgent(
    _policyHash: string,
    _policyVersion: string,
  ): Promise<{ txHash: string }> {
    // TODO(high): @agent Implement agent registration
    // Context: Call InvarianceCore.registerAgent(policyHash, policyVersion) on-chain
    // AC: Return transaction hash after successful registration
    throw new Error('Not implemented');
  }

  /**
   * Log an action execution.
   */
  async logAction(
    _actionId: ActionId,
    _intentHash: IntentHash,
    _category: ActionCategory,
    _valueMoved: bigint,
    _gasUsed: bigint,
    _success: boolean,
  ): Promise<{ txHash: string }> {
    // TODO(high): @agent Implement action logging
    // Context: Call InvarianceCore.logAction(...) on-chain
    // AC: Return transaction hash after successful logging
    throw new Error('Not implemented');
  }

  /**
   * Get the policy hash for a registered agent.
   */
  async getAgentConfig(_agentAddress: string): Promise<string> {
    // TODO(medium): @agent Implement config retrieval
    // Context: Call InvarianceCore.agentConfigs(address) view function
    // AC: Return the bytes32 config hash as hex string
    throw new Error('Not implemented');
  }

  /**
   * Get the policy version for a registered agent.
   */
  async getAgentPolicyVersion(_agentAddress: string): Promise<string> {
    // TODO(medium): @agent Implement version retrieval
    // Context: Call InvarianceCore.agentPolicyVersions(address) view function
    // AC: Return the policy version string
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
