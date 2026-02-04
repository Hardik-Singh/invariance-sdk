import type { ContractAddresses } from '@invariance/common';
import type {
  CustomPermissionId,
  CustomPermissionMetadata,
  CustomPermissionConfig,
  AgentPermissionConfig,
  CustomPermissionCheckResult,
} from '@invariance/common';

/**
 * Registration data from the contract.
 */
export interface PermissionRegistration {
  /** Address of the ICustomPermission contract */
  contractAddress: string;
  /** Address that registered the permission */
  author: string;
  /** Block timestamp when registered */
  registrationTime: number;
  /** Number of agents using this permission */
  usageCount: number;
  /** Whether the permission has been audited/verified */
  verified: boolean;
  /** Whether the permission is available for use */
  active: boolean;
  /** Array of version contract addresses */
  versions: string[];
}

/**
 * Result of registering a permission.
 */
export interface RegisterResult {
  /** The assigned permission ID */
  permissionId: CustomPermissionId;
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
}

/**
 * Result of enabling a permission.
 */
export interface EnableResult {
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
}

/**
 * Result of disabling a permission.
 */
export interface DisableResult {
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
}

/**
 * Result of updating a permission version.
 */
export interface UpdateVersionResult {
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
}

/**
 * Interface for PermissionRegistry contract.
 */
export interface PermissionRegistryContract {
  /**
   * Register a new permission in the marketplace.
   *
   * @param permissionContract - Address of the ICustomPermission contract
   * @returns Registration result with permission ID and transaction details
   */
  register(permissionContract: string): Promise<RegisterResult>;

  /**
   * Update a permission to a new version.
   *
   * @param permissionId - The permission to update
   * @param newContract - Address of the new version contract
   * @returns Update result with transaction details
   */
  updateVersion(
    permissionId: CustomPermissionId,
    newContract: string
  ): Promise<UpdateVersionResult>;

  /**
   * Enable a permission for the calling agent.
   *
   * @param config - Permission configuration
   * @returns Enable result with transaction details
   */
  enableForAgent(config: CustomPermissionConfig): Promise<EnableResult>;

  /**
   * Disable a permission for the calling agent.
   *
   * @param permissionId - The permission to disable
   * @returns Disable result with transaction details
   */
  disableForAgent(permissionId: CustomPermissionId): Promise<DisableResult>;

  /**
   * Check a single permission for an agent.
   *
   * @param agent - The agent address
   * @param permissionId - The permission to check
   * @param action - The action being performed
   * @param params - The action parameters
   * @returns Permission check result
   */
  checkPermission(
    agent: string,
    permissionId: CustomPermissionId,
    action: string,
    params: Uint8Array
  ): Promise<CustomPermissionCheckResult>;

  /**
   * Check all enabled permissions for an agent.
   *
   * @param agent - The agent address
   * @param action - The action being performed
   * @param params - The action parameters
   * @returns Permission check result
   */
  checkAllPermissions(
    agent: string,
    action: string,
    params: Uint8Array
  ): Promise<CustomPermissionCheckResult>;

  /**
   * Get permission registration data.
   *
   * @param permissionId - The permission ID
   * @returns Permission registration data
   */
  getPermission(permissionId: CustomPermissionId): Promise<PermissionRegistration>;

  /**
   * Get permission metadata from the contract.
   *
   * @param permissionId - The permission ID
   * @returns Permission metadata
   */
  getPermissionMetadata(permissionId: CustomPermissionId): Promise<CustomPermissionMetadata>;

  /**
   * Get all permissions registered by an author.
   *
   * @param author - The author address
   * @returns Array of permission IDs
   */
  getPermissionsByAuthor(author: string): Promise<CustomPermissionId[]>;

  /**
   * Get all permissions enabled for an agent.
   *
   * @param agent - The agent address
   * @returns Array of permission IDs
   */
  getAgentPermissions(agent: string): Promise<CustomPermissionId[]>;

  /**
   * Get agent's configuration for a specific permission.
   *
   * @param agent - The agent address
   * @param permissionId - The permission ID
   * @returns Agent's permission configuration
   */
  getAgentPermissionConfig(
    agent: string,
    permissionId: CustomPermissionId
  ): Promise<AgentPermissionConfig>;

  /**
   * Get permission ID by contract address.
   *
   * @param contractAddress - The permission contract address
   * @returns The permission ID (or null if not found)
   */
  getPermissionIdByContract(contractAddress: string): Promise<CustomPermissionId | null>;

  /**
   * Get the total number of registered permissions.
   *
   * @returns The count of registered permissions
   */
  getPermissionCount(): Promise<number>;
}

/**
 * Wrapper for the PermissionRegistry contract.
 *
 * @example
 * ```typescript
 * const registry = new PermissionRegistry(addresses, rpcUrl);
 *
 * // Register a new permission
 * const { permissionId } = await registry.register(myContractAddress);
 *
 * // Enable for your agent
 * await registry.enableForAgent({
 *   permissionId,
 *   gasBudget: 100_000n,
 * });
 *
 * // Check permissions
 * const result = await registry.checkAllPermissions(
 *   agentAddress,
 *   'transfer',
 *   encodedParams,
 * );
 * ```
 */
export class PermissionRegistry implements PermissionRegistryContract {
  /** @internal */
  readonly _contractAddress: string;
  /** @internal */
  readonly _rpcUrl: string;

  constructor(addresses: ContractAddresses, rpcUrl: string) {
    this._contractAddress = addresses.permissionRegistry;
    this._rpcUrl = rpcUrl;
  }

  /**
   * Get the contract address.
   */
  getAddress(): string {
    return this._contractAddress;
  }

  /**
   * Register a new permission in the marketplace.
   */
  async register(_permissionContract: string): Promise<RegisterResult> {
    // TODO: Implement contract call
    // 1. Encode function call: register(address)
    // 2. Send transaction
    // 3. Wait for receipt
    // 4. Decode PermissionRegistered event to get permissionId
    throw new Error('Not implemented');
  }

  /**
   * Update a permission to a new version.
   */
  async updateVersion(
    _permissionId: CustomPermissionId,
    _newContract: string
  ): Promise<UpdateVersionResult> {
    // TODO: Implement contract call
    // 1. Encode function call: updateVersion(uint256, address)
    // 2. Send transaction
    // 3. Wait for receipt
    throw new Error('Not implemented');
  }

  /**
   * Enable a permission for the calling agent.
   */
  async enableForAgent(_config: CustomPermissionConfig): Promise<EnableResult> {
    // TODO: Implement contract call
    // 1. Encode function call: enableForAgent(uint256, uint256)
    // 2. Send transaction
    // 3. Wait for receipt
    throw new Error('Not implemented');
  }

  /**
   * Disable a permission for the calling agent.
   */
  async disableForAgent(_permissionId: CustomPermissionId): Promise<DisableResult> {
    // TODO: Implement contract call
    // 1. Encode function call: disableForAgent(uint256)
    // 2. Send transaction
    // 3. Wait for receipt
    throw new Error('Not implemented');
  }

  /**
   * Check a single permission for an agent.
   */
  async checkPermission(
    _agent: string,
    _permissionId: CustomPermissionId,
    _action: string,
    _params: Uint8Array
  ): Promise<CustomPermissionCheckResult> {
    // TODO: Implement contract call
    // 1. Encode function call: checkPermission(address, uint256, bytes32, bytes)
    // 2. Make staticcall
    // 3. Decode result
    throw new Error('Not implemented');
  }

  /**
   * Check all enabled permissions for an agent.
   */
  async checkAllPermissions(
    _agent: string,
    _action: string,
    _params: Uint8Array
  ): Promise<CustomPermissionCheckResult> {
    // TODO: Implement contract call
    // 1. Encode function call: checkAllPermissions(address, bytes32, bytes)
    // 2. Make staticcall
    // 3. Decode result
    throw new Error('Not implemented');
  }

  /**
   * Get permission registration data.
   */
  async getPermission(_permissionId: CustomPermissionId): Promise<PermissionRegistration> {
    // TODO: Implement contract call
    // 1. Encode function call: getPermission(uint256)
    // 2. Make staticcall
    // 3. Decode result
    throw new Error('Not implemented');
  }

  /**
   * Get permission metadata from the contract.
   */
  async getPermissionMetadata(
    _permissionId: CustomPermissionId
  ): Promise<CustomPermissionMetadata> {
    // TODO: Implement contract call
    // 1. Call getPermission to get contract address
    // 2. Call ICustomPermission.metadata() on the contract
    // 3. Combine with registration data
    throw new Error('Not implemented');
  }

  /**
   * Get all permissions registered by an author.
   */
  async getPermissionsByAuthor(_author: string): Promise<CustomPermissionId[]> {
    // TODO: Implement contract call
    // 1. Encode function call: getPermissionsByAuthor(address)
    // 2. Make staticcall
    // 3. Decode result and map to CustomPermissionId
    throw new Error('Not implemented');
  }

  /**
   * Get all permissions enabled for an agent.
   */
  async getAgentPermissions(_agent: string): Promise<CustomPermissionId[]> {
    // TODO: Implement contract call
    // 1. Encode function call: getAgentPermissions(address)
    // 2. Make staticcall
    // 3. Decode result and map to CustomPermissionId
    throw new Error('Not implemented');
  }

  /**
   * Get agent's configuration for a specific permission.
   */
  async getAgentPermissionConfig(
    _agent: string,
    _permissionId: CustomPermissionId
  ): Promise<AgentPermissionConfig> {
    // TODO: Implement contract call
    // 1. Encode function call: getAgentPermissionConfig(address, uint256)
    // 2. Make staticcall
    // 3. Decode result
    throw new Error('Not implemented');
  }

  /**
   * Get permission ID by contract address.
   */
  async getPermissionIdByContract(
    _contractAddress: string
  ): Promise<CustomPermissionId | null> {
    // TODO: Implement contract call
    // 1. Encode function call: getPermissionIdByContract(address)
    // 2. Make staticcall
    // 3. Decode result (0 means not found)
    throw new Error('Not implemented');
  }

  /**
   * Get the total number of registered permissions.
   */
  async getPermissionCount(): Promise<number> {
    // TODO: Implement contract call
    // 1. Encode function call: getPermissionCount()
    // 2. Make staticcall
    // 3. Decode result
    throw new Error('Not implemented');
  }
}
