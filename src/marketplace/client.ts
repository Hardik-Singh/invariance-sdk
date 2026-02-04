import type { ContractAddresses } from '@invariance/common';
import type {
  CustomPermissionId,
  CustomPermissionMetadata,
  CustomPermissionConfig,
  AgentPermissionConfig,
  ListPermissionsOptions,
  CustomPermissionCheckResult,
} from '@invariance/common';
import { createCustomPermissionId } from '@invariance/common';
import type { WalletAdapter } from '../wallet/types.js';
import { PermissionRegistry } from '../contracts/permission-registry.js';
import { InvarianceError } from '../errors/base.js';

/**
 * Transaction result with hash.
 */
export interface TransactionResult {
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
}

/**
 * Options for initializing the marketplace client.
 */
export interface MarketplaceClientOptions {
  /** Contract addresses */
  addresses: ContractAddresses;
  /** RPC URL for blockchain communication */
  rpcUrl: string;
  /** Wallet adapter for signing transactions */
  wallet?: WalletAdapter | undefined;
}

/**
 * Client for interacting with the Invariance Permission Marketplace.
 *
 * The marketplace allows users to:
 * - Browse and discover community-created permissions
 * - Enable permissions for their agents
 * - Track which permissions are active
 *
 * @example
 * ```typescript
 * const marketplace = new MarketplaceClient({
 *   addresses: getContractAddresses(8453),
 *   rpcUrl: 'https://mainnet.base.org',
 *   wallet: myWallet,
 * });
 *
 * // Browse available permissions
 * const permissions = await marketplace.listPermissions({
 *   tag: 'spending',
 *   verifiedOnly: true,
 * });
 *
 * // Enable a permission for your agent
 * await marketplace.enablePermission({
 *   permissionId: permissions[0].permissionId,
 *   gasBudget: 50000n,
 * });
 *
 * // Check what's enabled
 * const enabled = await marketplace.getEnabledPermissions(myAgentAddress);
 * ```
 */
export class MarketplaceClient {
  /** @internal */
  readonly registry: PermissionRegistry;
  /** @internal */
  readonly rpcUrl: string;
  /** @internal */
  readonly wallet: WalletAdapter | undefined;

  constructor(options: MarketplaceClientOptions) {
    this.registry = new PermissionRegistry(options.addresses, options.rpcUrl);
    this.rpcUrl = options.rpcUrl;
    this.wallet = options.wallet;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * List permissions in the marketplace.
   *
   * @param options - Filtering and pagination options
   * @returns Array of permission metadata
   *
   * @example
   * ```typescript
   * // Get all verified spending-related permissions
   * const permissions = await marketplace.listPermissions({
   *   tag: 'spending',
   *   verifiedOnly: true,
   *   sortBy: 'usageCount',
   *   sortOrder: 'desc',
   *   limit: 10,
   * });
   * ```
   */
  async listPermissions(
    options: ListPermissionsOptions = {}
  ): Promise<CustomPermissionMetadata[]> {
    const {
      tag,
      author,
      verifiedOnly = false,
      activeOnly = true,
      limit = 100,
      offset = 0,
      sortBy = 'registrationTime',
      sortOrder = 'desc',
    } = options;

    // Get total count
    const count = await this.registry.getPermissionCount();
    const permissions: CustomPermissionMetadata[] = [];

    // Fetch all permissions (in a real implementation, this would use pagination/indexing)
    for (let i = 1; i <= count; i++) {
      try {
        const permissionId = createCustomPermissionId(i);
        const metadata = await this.registry.getPermissionMetadata(permissionId);

        // Apply filters
        if (activeOnly && !metadata.active) continue;
        if (verifiedOnly && !metadata.verified) continue;
        if (author && metadata.author.toLowerCase() !== author.toLowerCase()) continue;
        if (tag && !metadata.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;

        permissions.push(metadata);
      } catch {
        // Skip invalid permissions
        continue;
      }
    }

    // Sort
    permissions.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'usageCount':
          comparison = a.usageCount - b.usageCount;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'registrationTime':
        default:
          comparison = a.registrationTime - b.registrationTime;
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    return permissions.slice(offset, offset + limit);
  }

  /**
   * Get a specific permission by ID.
   *
   * @param permissionId - The permission ID
   * @returns Permission metadata
   *
   * @example
   * ```typescript
   * const permission = await marketplace.getPermission(createCustomPermissionId(1));
   * console.log(permission.name, permission.description);
   * ```
   */
  async getPermission(permissionId: CustomPermissionId): Promise<CustomPermissionMetadata> {
    return this.registry.getPermissionMetadata(permissionId);
  }

  /**
   * Get featured/popular permissions.
   *
   * @param limit - Maximum number of results (default: 10)
   * @returns Array of permission metadata sorted by usage
   *
   * @example
   * ```typescript
   * const featured = await marketplace.getFeaturedPermissions();
   * ```
   */
  async getFeaturedPermissions(limit = 10): Promise<CustomPermissionMetadata[]> {
    return this.listPermissions({
      verifiedOnly: true,
      activeOnly: true,
      sortBy: 'usageCount',
      sortOrder: 'desc',
      limit,
    });
  }

  /**
   * Get permissions by a specific author.
   *
   * @param author - The author address
   * @returns Array of permission metadata
   *
   * @example
   * ```typescript
   * const myPermissions = await marketplace.getPermissionsByAuthor(myAddress);
   * ```
   */
  async getPermissionsByAuthor(author: string): Promise<CustomPermissionMetadata[]> {
    const ids = await this.registry.getPermissionsByAuthor(author);
    const permissions: CustomPermissionMetadata[] = [];

    for (const id of ids) {
      try {
        const metadata = await this.registry.getPermissionMetadata(id);
        permissions.push(metadata);
      } catch {
        continue;
      }
    }

    return permissions;
  }

  /**
   * Get all permissions enabled for an agent.
   *
   * @param agent - The agent address
   * @returns Array of permission metadata (only active ones)
   *
   * @example
   * ```typescript
   * const enabled = await marketplace.getEnabledPermissions(agentAddress);
   * console.log(`Agent has ${enabled.length} permissions enabled`);
   * ```
   */
  async getEnabledPermissions(agent: string): Promise<CustomPermissionMetadata[]> {
    const ids = await this.registry.getAgentPermissions(agent);
    const permissions: CustomPermissionMetadata[] = [];

    for (const id of ids) {
      try {
        const config = await this.registry.getAgentPermissionConfig(agent, id);
        if (config.active) {
          const metadata = await this.registry.getPermissionMetadata(id);
          permissions.push(metadata);
        }
      } catch {
        continue;
      }
    }

    return permissions;
  }

  /**
   * Get agent's configuration for a specific permission.
   *
   * @param agent - The agent address
   * @param permissionId - The permission ID
   * @returns Agent's permission configuration
   *
   * @example
   * ```typescript
   * const config = await marketplace.getAgentPermissionConfig(
   *   agentAddress,
   *   permissionId,
   * );
   * console.log(`Gas budget: ${config.gasBudget}`);
   * ```
   */
  async getAgentPermissionConfig(
    agent: string,
    permissionId: CustomPermissionId
  ): Promise<AgentPermissionConfig> {
    return this.registry.getAgentPermissionConfig(agent, permissionId);
  }

  // ============================================================================
  // Action Methods (require wallet)
  // ============================================================================

  /**
   * Enable a permission for the current agent.
   *
   * @param config - Permission configuration
   * @returns Transaction result
   *
   * @example
   * ```typescript
   * const result = await marketplace.enablePermission({
   *   permissionId: createCustomPermissionId(1),
   *   gasBudget: 100000n,
   * });
   * console.log(`Enabled in tx: ${result.txHash}`);
   * ```
   */
  async enablePermission(config: CustomPermissionConfig): Promise<TransactionResult> {
    this.requireWallet();

    // Validate permission exists and is active
    const metadata = await this.registry.getPermissionMetadata(config.permissionId);
    if (!metadata.active) {
      throw new InvarianceError(`Permission ${config.permissionId} is not active`);
    }

    const result = await this.registry.enableForAgent(config);
    return {
      txHash: result.txHash,
      blockNumber: result.blockNumber,
    };
  }

  /**
   * Disable a permission for the current agent.
   *
   * @param permissionId - The permission to disable
   * @returns Transaction result
   *
   * @example
   * ```typescript
   * await marketplace.disablePermission(createCustomPermissionId(1));
   * ```
   */
  async disablePermission(permissionId: CustomPermissionId): Promise<TransactionResult> {
    this.requireWallet();

    const result = await this.registry.disableForAgent(permissionId);
    return {
      txHash: result.txHash,
      blockNumber: result.blockNumber,
    };
  }

  // ============================================================================
  // Permission Checking
  // ============================================================================

  /**
   * Check all enabled permissions for an agent.
   *
   * @param agent - The agent address
   * @param action - The action identifier
   * @param params - Encoded action parameters
   * @returns Permission check result
   *
   * @example
   * ```typescript
   * const result = await marketplace.checkPermissions(
   *   agentAddress,
   *   'transfer',
   *   encodedParams,
   * );
   * if (!result.allowed) {
   *   console.log(`Denied by permission ${result.deniedByPermissionId}: ${result.reason}`);
   * }
   * ```
   */
  async checkPermissions(
    agent: string,
    action: string,
    params: Uint8Array
  ): Promise<CustomPermissionCheckResult> {
    return this.registry.checkAllPermissions(agent, action, params);
  }

  /**
   * Check a single permission for an agent.
   *
   * @param agent - The agent address
   * @param permissionId - The permission to check
   * @param action - The action identifier
   * @param params - Encoded action parameters
   * @returns Permission check result
   */
  async checkPermission(
    agent: string,
    permissionId: CustomPermissionId,
    action: string,
    params: Uint8Array
  ): Promise<CustomPermissionCheckResult> {
    return this.registry.checkPermission(agent, permissionId, action, params);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get the underlying registry contract.
   */
  getRegistry(): PermissionRegistry {
    return this.registry;
  }

  /**
   * Ensure a wallet is configured.
   */
  private requireWallet(): void {
    if (!this.wallet) {
      throw new InvarianceError('Wallet required for this operation');
    }
  }
}
