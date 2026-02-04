import type { ActionInput, ActionResult, PermissionConfig } from '@invariance/common';
import { getChainConfig, getContractAddresses } from '@invariance/common';
import type { WalletAdapter } from './wallet/types.js';
import { Verifier } from './core/verifier.js';
import { InvarianceError } from './errors/base.js';

/**
 * Configuration options for the Invariance client.
 */
export interface InvarianceConfig {
  /** The chain ID of the target blockchain (e.g., 8453 for Base) */
  chainId: number;
  /** The RPC URL for blockchain communication */
  rpcUrl: string;
  /** Wallet adapter for signing transactions */
  wallet?: WalletAdapter;
  /** Permission configuration for this agent */
  permissions?: PermissionConfig;
}

/**
 * Callback function type for beforeExecution hook.
 */
export type BeforeExecutionCallback = (action: ActionInput) => Promise<void> | void;

/**
 * The main Invariance client for verifying and logging agent actions.
 *
 * @example
 * ```typescript
 * const inv = new Invariance({
 *   chainId: 8453,
 *   rpcUrl: process.env.RPC_URL,
 * });
 *
 * // Execute an action with verification
 * const result = await inv.execute({
 *   type: 'transfer',
 *   params: { to: '0x...', amount: '1000000' },
 * });
 * ```
 */
export class Invariance {
  private readonly config: InvarianceConfig;
  private readonly verifier: Verifier;
  private beforeExecutionCallbacks: BeforeExecutionCallback[] = [];

  constructor(config: InvarianceConfig) {
    // Validate chain is supported
    const chainConfig = getChainConfig(config.chainId);
    if (!chainConfig) {
      throw new InvarianceError(`Unsupported chain ID: ${config.chainId}`);
    }

    // Validate contracts are deployed
    const contracts = getContractAddresses(config.chainId);
    if (!contracts) {
      throw new InvarianceError(`No contracts deployed on chain: ${config.chainId}`);
    }

    this.config = config;
    this.verifier = new Verifier(config.permissions);
  }

  /**
   * Register a callback to run before each action execution.
   * Use this to add custom validation or logging.
   *
   * @param callback - Function to call before execution
   */
  beforeExecution(callback: BeforeExecutionCallback): void {
    this.beforeExecutionCallbacks.push(callback);
  }

  /**
   * Execute an action with full verification and logging.
   *
   * @param input - The action to execute
   * @returns The result of the action execution
   * @throws {PermissionDeniedError} If the action is not permitted
   * @throws {StateFailedError} If required on-chain state is not satisfied
   */
  async execute(input: ActionInput): Promise<ActionResult> {
    // Run beforeExecution callbacks
    for (const callback of this.beforeExecutionCallbacks) {
      await callback(input);
    }

    // Verify permissions
    const permissionResult = this.verifier.checkPermission(input);
    if (!permissionResult.allowed) {
      throw new InvarianceError(
        `Permission denied: ${permissionResult.reason ?? 'Unknown reason'}`,
      );
    }

    // TODO(high): @agent Implement action execution
    // Context: Need to serialize action, sign with wallet, submit to contract
    // AC: Submit transaction to ExecutionLog contract and return result
    throw new Error('Not implemented');
  }

  /**
   * Check if an action is permitted without executing it.
   *
   * @param input - The action to check
   * @returns Whether the action is permitted
   */
  checkPermission(input: ActionInput): boolean {
    return this.verifier.checkPermission(input).allowed;
  }

  /**
   * Get the current chain configuration.
   */
  getChainConfig() {
    return getChainConfig(this.config.chainId);
  }

  /**
   * Get the contract addresses for the current chain.
   */
  getContractAddresses() {
    return getContractAddresses(this.config.chainId);
  }
}
