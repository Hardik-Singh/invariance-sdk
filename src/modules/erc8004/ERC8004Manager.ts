/**
 * Standalone ERC-8004 (Trustless Agents) manager.
 *
 * NO dependency on ContractFactory, EventEmitter, or Telemetry.
 * Takes raw viem PublicClient + optional WalletClient directly.
 * Can be used without any Invariance infrastructure.
 *
 * @example
 * ```typescript
 * import { createPublicClient, http } from 'viem';
 * import { base } from 'viem/chains';
 * import { ERC8004Manager } from '@invariance/sdk';
 *
 * const publicClient = createPublicClient({ chain: base, transport: http() });
 * const manager = new ERC8004Manager({ chainId: 8453, publicClient });
 *
 * const agent = await manager.getAgent(1n);
 * const summary = await manager.getSummary(1n);
 * ```
 */

import { getContract as viemGetContract } from 'viem';
import type { PublicClient, WalletClient } from 'viem';
import { ERC8004IdentityRegistryAbi, ERC8004ReputationRegistryAbi, ERC8004ValidationRegistryAbi } from './abis.js';
import { getERC8004Addresses } from './addresses.js';
import type {
  ERC8004Config,
  ERC8004RegistryAddresses,
  ERC8004AgentIdentity,
  ERC8004Metadata,
  GiveFeedbackOptions,
  ERC8004Feedback,
  ERC8004ReputationSummary,
  ReputationSummaryFilterOptions,
  ValidationRequestOptions,
  ValidationResponseOptions,
  ERC8004ValidationStatus,
  ERC8004ValidationSummary,
  ValidationSummaryFilterOptions,
} from './types.js';

/** Transaction receipt returned by write methods */
interface TxReceipt {
  txHash: string;
  blockNumber: number;
  status: 'success' | 'reverted';
}

/** Simplified contract interface for internal use */
interface ContractInstance {
  address: `0x${string}`;
  abi: readonly unknown[];
  read: Record<string, ((...args: unknown[]) => Promise<unknown>) | undefined>;
  write: Record<string, ((...args: unknown[]) => Promise<`0x${string}`>) | undefined>;
}

export class ERC8004Manager {
  private readonly chainId: number;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly registryAddresses: ERC8004RegistryAddresses;

  private readonly identityContract: ContractInstance;
  private readonly reputationContract: ContractInstance;
  private readonly validationContract: ContractInstance;

  constructor(config: ERC8004Config) {
    this.chainId = config.chainId;
    this.publicClient = config.publicClient as PublicClient;
    this.walletClient = config.walletClient as WalletClient | undefined;

    // Resolve registry addresses
    const addresses = config.registryAddresses ?? getERC8004Addresses(config.chainId);
    if (!addresses) {
      throw new ERC8004Error(
        'ERC8004_NOT_DEPLOYED',
        `ERC-8004 registries are not deployed on chain ${config.chainId}. Provide registryAddresses in config.`,
      );
    }
    this.registryAddresses = addresses;

    // Create contract instances
    const client = this.walletClient
      ? { public: this.publicClient, wallet: this.walletClient }
      : { public: this.publicClient };

    this.identityContract = viemGetContract({
      address: addresses.identity,
      abi: ERC8004IdentityRegistryAbi,
      client,
    }) as unknown as ContractInstance;

    this.reputationContract = viemGetContract({
      address: addresses.reputation,
      abi: ERC8004ReputationRegistryAbi,
      client,
    }) as unknown as ContractInstance;

    this.validationContract = viemGetContract({
      address: addresses.validation,
      abi: ERC8004ValidationRegistryAbi,
      client,
    }) as unknown as ContractInstance;
  }

  // ===========================================================================
  // Identity Methods
  // ===========================================================================

  /**
   * Register a new agent identity in the ERC-8004 Identity Registry.
   *
   * @param agentURI - Off-chain metadata URI for the agent
   * @param metadata - Optional initial metadata key-value pairs
   * @returns The registered agent identity
   */
  async register(agentURI: string, metadata?: ERC8004Metadata[]): Promise<ERC8004AgentIdentity> {
    this.requireWalletClient();

    const registerFn = this.getWriteFn(this.identityContract, 'register');
    const txHash = await registerFn([agentURI]);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse agent ID from AgentRegistered event
    const agentId = this.parseAgentIdFromLogs(receipt.logs);

    // Set metadata if provided
    if (metadata && metadata.length > 0) {
      const setMetaFn = this.getWriteFn(this.identityContract, 'setMetadata');
      for (const { key, value } of metadata) {
        await setMetaFn([agentId, key, value]);
      }
    }

    const wallet = await this.getReadFn(this.identityContract, 'getAgentWallet')([agentId]) as `0x${string}`;

    return {
      agentId,
      agentURI,
      wallet,
      globalId: this.computeGlobalId(agentId),
      metadata: metadata ?? [],
    };
  }

  /**
   * Get an agent identity by ID.
   *
   * @param agentId - The on-chain agent ID
   * @returns The agent identity
   */
  async getAgent(agentId: bigint): Promise<ERC8004AgentIdentity> {
    const agentURI = await this.getReadFn(this.identityContract, 'agentURI')([agentId]) as string;

    if (!agentURI) {
      throw new ERC8004Error(
        'ERC8004_AGENT_NOT_FOUND',
        `Agent ${agentId} not found in the Identity Registry.`,
      );
    }

    const wallet = await this.getReadFn(this.identityContract, 'getAgentWallet')([agentId]) as `0x${string}`;

    return {
      agentId,
      agentURI,
      wallet,
      globalId: this.computeGlobalId(agentId),
      metadata: [],
    };
  }

  /**
   * Set a metadata value on an agent identity.
   *
   * @param agentId - The agent ID
   * @param key - Metadata key
   * @param value - Metadata value
   * @returns Transaction receipt
   */
  async setMetadata(agentId: bigint, key: string, value: string): Promise<TxReceipt> {
    this.requireWalletClient();
    const txHash = await this.getWriteFn(this.identityContract, 'setMetadata')([agentId, key, value]);
    return this.waitForTxReceipt(txHash);
  }

  /**
   * Get a metadata value from an agent identity.
   *
   * @param agentId - The agent ID
   * @param key - Metadata key
   * @returns The metadata value
   */
  async getMetadata(agentId: bigint, key: string): Promise<string> {
    return this.getReadFn(this.identityContract, 'getMetadata')([agentId, key]) as Promise<string>;
  }

  /**
   * Set the wallet address for an agent (with signature authorization).
   *
   * @param agentId - The agent ID
   * @param newWallet - New wallet address
   * @param deadline - Signature deadline timestamp
   * @param signature - Authorization signature
   * @returns Transaction receipt
   */
  async setAgentWallet(agentId: bigint, newWallet: `0x${string}`, deadline: bigint, signature: `0x${string}`): Promise<TxReceipt> {
    this.requireWalletClient();
    const txHash = await this.getWriteFn(this.identityContract, 'setAgentWallet')([agentId, newWallet, deadline, signature]);
    return this.waitForTxReceipt(txHash);
  }

  /**
   * Set the agent URI.
   *
   * @param agentId - The agent ID
   * @param newURI - New agent URI
   * @returns Transaction receipt
   */
  async setAgentURI(agentId: bigint, newURI: string): Promise<TxReceipt> {
    this.requireWalletClient();
    const txHash = await this.getWriteFn(this.identityContract, 'setAgentURI')([agentId, newURI]);
    return this.waitForTxReceipt(txHash);
  }

  /**
   * Compute the cross-chain global ID for an agent.
   *
   * @param agentId - The on-chain agent ID
   * @returns The global ID string: eip155:{chainId}:{registryAddress}:{agentId}
   */
  getGlobalId(agentId: bigint): string {
    return this.computeGlobalId(agentId);
  }

  // ===========================================================================
  // Reputation Methods
  // ===========================================================================

  /**
   * Give feedback on an agent.
   *
   * @param opts - Feedback options
   * @returns Transaction receipt
   */
  async giveFeedback(opts: GiveFeedbackOptions): Promise<TxReceipt> {
    this.requireWalletClient();
    const txHash = await this.getWriteFn(this.reputationContract, 'giveFeedback')([
      opts.agentId,
      opts.value,
      opts.tag1,
      opts.tag2 ?? '',
      opts.feedbackURI ?? '',
    ]);
    return this.waitForTxReceipt(txHash);
  }

  /**
   * Revoke previously given feedback.
   *
   * @param agentId - The agent ID
   * @param feedbackIndex - Index of the feedback to revoke
   * @returns Transaction receipt
   */
  async revokeFeedback(agentId: bigint, feedbackIndex: bigint): Promise<TxReceipt> {
    this.requireWalletClient();
    const txHash = await this.getWriteFn(this.reputationContract, 'revokeFeedback')([agentId, feedbackIndex]);
    return this.waitForTxReceipt(txHash);
  }

  /**
   * Get reputation summary for an agent.
   *
   * @param agentId - The agent ID
   * @param _opts - Optional filter options (reserved for future use)
   * @returns Reputation summary
   */
  async getSummary(agentId: bigint, _opts?: ReputationSummaryFilterOptions): Promise<ERC8004ReputationSummary> {
    const result = await this.getReadFn(this.reputationContract, 'getSummary')([agentId]) as [bigint, bigint, number];
    return {
      count: Number(result[0]),
      summaryValue: Number(result[1]),
      decimals: result[2],
    };
  }

  /**
   * Read a single feedback entry.
   *
   * @param agentId - The agent ID
   * @param client - The client address who gave the feedback
   * @param index - Feedback index for this client
   * @returns The feedback entry
   */
  async readFeedback(agentId: bigint, client: `0x${string}`, index: bigint): Promise<ERC8004Feedback> {
    const result = await this.getReadFn(this.reputationContract, 'readFeedback')([agentId, client, index]) as [number, string, string, string, bigint];
    return {
      client,
      value: result[0],
      tag1: result[1],
      tag2: result[2],
      feedbackURI: result[3],
      timestamp: Number(result[4]),
    };
  }

  /**
   * Read all feedback entries for an agent.
   *
   * @param agentId - The agent ID
   * @returns All feedback entries
   */
  async readAllFeedback(agentId: bigint): Promise<ERC8004Feedback[]> {
    const result = await this.getReadFn(this.reputationContract, 'readAllFeedback')([agentId]) as Array<{
      client: `0x${string}`;
      value: number;
      tag1: string;
      tag2: string;
      feedbackURI: string;
      timestamp: bigint;
    }>;
    return result.map((f) => ({
      client: f.client,
      value: f.value,
      tag1: f.tag1,
      tag2: f.tag2,
      feedbackURI: f.feedbackURI,
      timestamp: Number(f.timestamp),
    }));
  }

  // ===========================================================================
  // Validation Methods
  // ===========================================================================

  /**
   * Submit a validation request for an agent.
   *
   * @param opts - Validation request options
   * @returns Transaction receipt
   */
  async requestValidation(opts: ValidationRequestOptions): Promise<TxReceipt> {
    this.requireWalletClient();
    const txHash = await this.getWriteFn(this.validationContract, 'validationRequest')([
      opts.agentId,
      opts.validator,
      opts.requestURI,
    ]);
    return this.waitForTxReceipt(txHash);
  }

  /**
   * Respond to a validation request.
   *
   * @param opts - Validation response options
   * @returns Transaction receipt
   */
  async respondToValidation(opts: ValidationResponseOptions): Promise<TxReceipt> {
    this.requireWalletClient();
    const txHash = await this.getWriteFn(this.validationContract, 'validationResponse')([
      opts.requestHash,
      opts.response,
      opts.responseURI ?? '',
    ]);
    return this.waitForTxReceipt(txHash);
  }

  /**
   * Get the status of a validation request.
   *
   * @param requestHash - The validation request hash
   * @returns Validation status
   */
  async getValidationStatus(requestHash: `0x${string}`): Promise<ERC8004ValidationStatus> {
    const result = await this.getReadFn(this.validationContract, 'getValidationStatus')([requestHash]) as [bigint, `0x${string}`, string, number, string, boolean];
    return {
      requestHash,
      agentId: result[0],
      validator: result[1],
      requestURI: result[2],
      response: result[3],
      responseURI: result[4],
      completed: result[5],
    };
  }

  /**
   * Get validation summary for an agent.
   *
   * @param agentId - The agent ID
   * @param _opts - Optional filter options (reserved for future use)
   * @returns Validation summary
   */
  async getValidationSummary(agentId: bigint, _opts?: ValidationSummaryFilterOptions): Promise<ERC8004ValidationSummary> {
    const result = await this.getReadFn(this.validationContract, 'getSummary')([agentId]) as [bigint, bigint];
    return {
      count: Number(result[0]),
      avgResponse: Number(result[1]),
    };
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /** Get a read function from a contract, throwing if not found */
  private getReadFn(contract: ContractInstance, name: string): (...args: unknown[]) => Promise<unknown> {
    const fn = contract.read[name];
    if (!fn) {
      throw new ERC8004Error('ERC8004_NOT_DEPLOYED', `Contract read function "${name}" not found.`);
    }
    return fn;
  }

  /** Get a write function from a contract, throwing if not found */
  private getWriteFn(contract: ContractInstance, name: string): (...args: unknown[]) => Promise<`0x${string}`> {
    const fn = contract.write[name];
    if (!fn) {
      throw new ERC8004Error('ERC8004_NOT_DEPLOYED', `Contract write function "${name}" not found.`);
    }
    return fn;
  }

  /** Ensure walletClient is available for write operations */
  private requireWalletClient(): void {
    if (!this.walletClient) {
      throw new ERC8004Error(
        'ERC8004_NOT_DEPLOYED',
        'A WalletClient is required for write operations. Provide walletClient in config.',
      );
    }
  }

  /** Compute the global ID for an agent */
  private computeGlobalId(agentId: bigint): string {
    return `eip155:${this.chainId}:${this.registryAddresses.identity}:${agentId}`;
  }

  /** Wait for a transaction receipt and return a simplified result */
  private async waitForTxReceipt(txHash: `0x${string}`): Promise<TxReceipt> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return {
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      status: receipt.status,
    };
  }

  /** Parse agent ID from registration event logs */
  private parseAgentIdFromLogs(logs: readonly { topics: readonly string[]; data: string }[]): bigint {
    // AgentRegistered event: topic[0] is event sig, topic[1] is indexed agentId
    for (const log of logs) {
      if (log.topics.length >= 2 && log.topics[1]) {
        return BigInt(log.topics[1]);
      }
    }
    throw new ERC8004Error(
      'ERC8004_AGENT_NOT_FOUND',
      'Failed to parse agent ID from transaction logs.',
    );
  }
}

/**
 * Error class for ERC-8004 operations.
 * Standalone — does not extend InvarianceError.
 */
export class ERC8004Error extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ERC8004Error';
    this.code = code;
  }
}
