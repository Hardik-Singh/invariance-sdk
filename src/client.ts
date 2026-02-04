import type {
  ActionInput,
  ActionResult,
  PolicyConfig,
  Policy,
  IntentHash,
  ActionCategory,
  // Backward compat
  PermissionConfig,
} from '@invariance/common';
import { getChainConfig, getContractAddresses } from '@invariance/common';
import type { WalletAdapter } from './wallet/types.js';
import { Verifier } from './core/verifier.js';
import { CooldownTracker } from './core/cooldown-tracker.js';
import { generateIntentHash, generatePolicyHash, generateRuntimeFingerprint } from './core/intent.js';
import { InvarianceError } from './errors/base.js';
import { MarketplaceClient } from './marketplace/client.js';
import { CustomPermissionDeployer } from './marketplace/deployer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Risk signal level for anomaly detection.
 */
export type RiskSignal = 'high' | 'medium' | 'low' | null;

/**
 * Result of an anomaly check.
 */
export interface AnomalyResult {
  /** Risk signal level */
  riskSignal: RiskSignal;
  /** Reasons for the risk assessment */
  reasons?: string[];
  /** Whether to block the action */
  shouldBlock?: boolean;
}

/**
 * Context passed to anomaly detectors.
 */
export interface ExecutionContext {
  /** Recent actions executed by this actor */
  recentActions: ActionSummary[];
  /** Daily statistics */
  dailyStats: DailyStats;
  /** Current actor address */
  actor: string;
  /** Current timestamp */
  timestamp: number;
}

/**
 * Summary of a recently executed action.
 */
export interface ActionSummary {
  /** Action type */
  type: string;
  /** Action category */
  category: ActionCategory;
  /** Value moved (in wei) */
  valueMoved: bigint;
  /** Timestamp */
  timestamp: number;
  /** Whether the action succeeded */
  success: boolean;
}

/**
 * Daily statistics for anomaly detection.
 */
export interface DailyStats {
  /** Total number of actions today */
  actionCount: number;
  /** Total value moved today (in wei) */
  totalValue: bigint;
  /** Actions by category */
  byCategory: Partial<Record<ActionCategory, number>>;
}

/**
 * Callback for anomaly detection.
 */
export type AnomalyDetector = (
  action: ActionInput,
  context: ExecutionContext
) => Promise<AnomalyResult> | AnomalyResult;

/**
 * Result of action simulation.
 */
export interface SimulationResult {
  /** Whether the action would be allowed */
  allowed: boolean;
  /** Policy that would deny the action (if any) */
  deniedByPolicy: Policy | undefined;
  /** Reason for denial (if any) */
  reason: string | undefined;
  /** Estimated gas for execution */
  estimatedGas: bigint;
  /** Revert reason from simulation (if any) */
  revertReason: string | undefined;
  /** Intent hash for the action */
  intentHash: IntentHash;
  /** Risk signal from anomaly detection (if enabled) */
  riskSignal: RiskSignal | undefined;
}

/**
 * Runtime fingerprint information.
 */
export interface RuntimeFingerprint {
  /** SDK version */
  sdkVersion: string;
  /** Optional agent code hash */
  agentCodeHash: string | undefined;
  /** Combined fingerprint hash */
  fingerprint: string;
}

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
  /**
   * Policy configuration for this agent.
   * Use this instead of permissions for new code.
   */
  policies?: PolicyConfig;
  /**
   * @deprecated Use policies instead
   */
  permissions?: PermissionConfig;
  /**
   * Enable runtime fingerprinting.
   * When enabled, actions include a fingerprint of SDK version + agent code hash.
   * Opt-in for privacy reasons.
   */
  enableFingerprint?: boolean;
  /**
   * Hash of the agent code (for fingerprinting).
   * Only used if enableFingerprint is true.
   */
  agentCodeHash?: string;
}

/**
 * Callback function type for beforeExecution hook.
 */
export type BeforeExecutionCallback = (action: ActionInput) => Promise<void> | void;

// ============================================================================
// SDK Version
// ============================================================================

/**
 * Current SDK version.
 */
export const SDK_VERSION = '2.0.0';

// ============================================================================
// Invariance Client
// ============================================================================

/**
 * The main Invariance client for verifying and logging agent actions.
 *
 * @example
 * ```typescript
 * const inv = new Invariance({
 *   chainId: 8453,
 *   rpcUrl: process.env.RPC_URL,
 *   policies: {
 *     policies: [spendingCap.toPolicy()],
 *     defaultAllow: true,
 *   },
 * });
 *
 * // Simulate before executing
 * const sim = await inv.simulateExecute(action);
 * if (sim.allowed) {
 *   const result = await inv.execute(action);
 * }
 * ```
 */
export class Invariance {
  private readonly config: InvarianceConfig;
  private readonly verifier: Verifier;
  private readonly cooldownTracker: CooldownTracker;
  private readonly policyHash: string;
  private readonly runtimeFingerprint?: RuntimeFingerprint;
  private beforeExecutionCallbacks: BeforeExecutionCallback[] = [];
  private anomalyDetectors: AnomalyDetector[] = [];
  private recentActions: ActionSummary[] = [];
  private dailyStats: DailyStats = {
    actionCount: 0,
    totalValue: 0n,
    byCategory: {},
  };
  private lastStatsResetDate: string = '';

  // Marketplace module (lazy initialized)
  private _marketplace?: MarketplaceClient;
  private _deployer?: CustomPermissionDeployer;

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

    // Handle backward compat: permissions -> policies
    if (config.permissions && !config.policies) {
      console.warn('[Invariance] config.permissions is deprecated, use config.policies instead');
      config.policies = config.permissions;
    }

    this.config = config;
    this.verifier = new Verifier(config.policies);
    this.cooldownTracker = new CooldownTracker();

    // Generate policy hash
    this.policyHash = config.policies
      ? generatePolicyHash(config.policies)
      : '0x0000000000000000000000000000000000000000000000000000000000000000';

    // Generate runtime fingerprint if enabled
    if (config.enableFingerprint) {
      const fingerprint = generateRuntimeFingerprint(SDK_VERSION, config.agentCodeHash);
      this.runtimeFingerprint = {
        sdkVersion: SDK_VERSION,
        agentCodeHash: config.agentCodeHash,
        fingerprint,
      };
    }
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
   * Register an anomaly detector.
   * Anomaly detectors are called during simulation and can flag risky actions.
   *
   * @param detector - Function to detect anomalies
   */
  onAnomalyCheck(detector: AnomalyDetector): void {
    this.anomalyDetectors.push(detector);
  }

  /**
   * Simulate action execution without actually executing.
   * Use this to check if an action would be allowed and estimate gas.
   *
   * @param input - The action to simulate
   * @returns Simulation result with allowance, gas estimate, and risk signal
   */
  async simulateExecute(input: ActionInput): Promise<SimulationResult> {
    // Generate intent hash
    const intentHash = generateIntentHash(input, this.policyHash);

    // Check policies
    const policyResult = this.verifier.checkPolicy(input);
    if (!policyResult.allowed) {
      return {
        allowed: false,
        deniedByPolicy: policyResult.deniedBy,
        reason: policyResult.reason,
        estimatedGas: 0n,
        revertReason: undefined,
        intentHash,
        riskSignal: undefined,
      };
    }

    // Check cooldown
    const actor = await this.getActorAddress();
    const category = this.inferCategory(input);
    if (!this.cooldownTracker.canExecute(actor, category)) {
      const remaining = this.cooldownTracker.getRemainingCooldown(actor, category);
      return {
        allowed: false,
        deniedByPolicy: undefined,
        reason: `Cooldown active for ${category} actions. ${remaining}s remaining.`,
        estimatedGas: 0n,
        revertReason: undefined,
        intentHash,
        riskSignal: undefined,
      };
    }

    // Run anomaly detection
    let riskSignal: RiskSignal | undefined = undefined;
    if (this.anomalyDetectors.length > 0) {
      this.maybeResetDailyStats();
      const context: ExecutionContext = {
        recentActions: this.recentActions.slice(-100),
        dailyStats: { ...this.dailyStats },
        actor,
        timestamp: Date.now(),
      };

      for (const detector of this.anomalyDetectors) {
        const result = await detector(input, context);
        if (result.shouldBlock) {
          return {
            allowed: false,
            deniedByPolicy: undefined,
            reason: `Anomaly detected: ${result.reasons?.join(', ') ?? 'Unknown'}`,
            estimatedGas: 0n,
            revertReason: undefined,
            intentHash,
            riskSignal: result.riskSignal ?? undefined,
          };
        }
        // Take the highest risk signal
        if (result.riskSignal === 'high') {
          riskSignal = 'high';
        } else if (result.riskSignal === 'medium' && riskSignal !== 'high') {
          riskSignal = 'medium';
        } else if (result.riskSignal === 'low' && !riskSignal) {
          riskSignal = 'low';
        }
      }
    }

    // Estimate gas (placeholder - would need RPC call)
    const estimatedGas = 100_000n; // Default estimate

    return {
      allowed: true,
      deniedByPolicy: undefined,
      reason: undefined,
      estimatedGas,
      revertReason: undefined,
      intentHash,
      riskSignal,
    };
  }

  /**
   * Execute an action with full verification and logging.
   *
   * @param input - The action to execute
   * @returns The result of the action execution
   * @throws {PolicyDeniedError} If the action is not permitted
   * @throws {StateFailedError} If required on-chain state is not satisfied
   */
  async execute(input: ActionInput): Promise<ActionResult> {
    // Run beforeExecution callbacks
    for (const callback of this.beforeExecutionCallbacks) {
      await callback(input);
    }

    // Verify policies
    const policyResult = this.verifier.checkPolicy(input);
    if (!policyResult.allowed) {
      throw new InvarianceError(
        `Policy denied: ${policyResult.reason ?? 'Unknown reason'}`,
      );
    }

    // Check cooldown
    const actor = await this.getActorAddress();
    const category = this.inferCategory(input);
    if (!this.cooldownTracker.canExecute(actor, category)) {
      const remaining = this.cooldownTracker.getRemainingCooldown(actor, category);
      throw new InvarianceError(
        `Cooldown active for ${category} actions. ${remaining}s remaining.`,
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
  checkPolicy(input: ActionInput): boolean {
    return this.verifier.checkPolicy(input).allowed;
  }

  /**
   * @deprecated Use checkPolicy instead
   */
  checkPermission(input: ActionInput): boolean {
    return this.checkPolicy(input);
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

  /**
   * Get the policy hash for the current configuration.
   */
  getPolicyHash(): string {
    return this.policyHash;
  }

  /**
   * Get the runtime fingerprint (if enabled).
   */
  getRuntimeFingerprint(): RuntimeFingerprint | undefined {
    return this.runtimeFingerprint;
  }

  /**
   * Access the permission marketplace.
   *
   * The marketplace allows browsing, enabling, and disabling community-created
   * permission contracts.
   *
   * @example
   * ```typescript
   * // Browse available permissions
   * const permissions = await inv.marketplace.listPermissions({
   *   tag: 'spending',
   *   verifiedOnly: true,
   * });
   *
   * // Enable a permission
   * await inv.marketplace.enablePermission({
   *   permissionId: permissions[0].permissionId,
   *   gasBudget: 100000n,
   * });
   * ```
   */
  get marketplace(): MarketplaceClient {
    if (!this._marketplace) {
      const addresses = getContractAddresses(this.config.chainId);
      if (!addresses) {
        throw new InvarianceError(`No contracts deployed on chain: ${this.config.chainId}`);
      }
      this._marketplace = new MarketplaceClient({
        addresses,
        rpcUrl: this.config.rpcUrl,
        wallet: this.config.wallet,
      });
    }
    return this._marketplace;
  }

  /**
   * Access the custom permission deployer.
   *
   * The deployer allows creating and registering custom permission contracts
   * either from bytecode or built-in templates.
   *
   * @example
   * ```typescript
   * // Deploy from template
   * const { permissionId } = await inv.deployer.deployFromTemplate('max-daily-spend', {
   *   maxDaily: 10_000_000_000_000_000_000n, // 10 ETH
   * });
   *
   * // Get available templates
   * const templates = inv.deployer.getAvailableTemplates();
   * ```
   *
   * @throws {InvarianceError} If no wallet is configured
   */
  get deployer(): CustomPermissionDeployer {
    if (!this._deployer) {
      if (!this.config.wallet) {
        throw new InvarianceError('Wallet required for deployer');
      }
      const addresses = getContractAddresses(this.config.chainId);
      if (!addresses) {
        throw new InvarianceError(`No contracts deployed on chain: ${this.config.chainId}`);
      }
      this._deployer = new CustomPermissionDeployer({
        addresses,
        rpcUrl: this.config.rpcUrl,
        wallet: this.config.wallet,
      });
    }
    return this._deployer;
  }

  /**
   * Record an action execution for tracking.
   * Call this after successful execution to update cooldowns and stats.
   *
   * @param action - The action that was executed
   * @param valueMoved - Value moved in the action (in wei)
   * @param success - Whether the action succeeded
   */
  recordExecution(
    action: ActionInput,
    valueMoved: bigint,
    success: boolean
  ): void {
    const category = this.inferCategory(action);

    // Record for cooldown
    this.getActorAddress().then((actor) => {
      this.cooldownTracker.recordExecution(actor, category);
    });

    // Update recent actions
    this.recentActions.push({
      type: action.type,
      category,
      valueMoved,
      timestamp: Date.now(),
      success,
    });

    // Keep only last 1000 actions
    if (this.recentActions.length > 1000) {
      this.recentActions = this.recentActions.slice(-1000);
    }

    // Update daily stats
    this.maybeResetDailyStats();
    this.dailyStats.actionCount++;
    this.dailyStats.totalValue += valueMoved;
    this.dailyStats.byCategory[category] =
      (this.dailyStats.byCategory[category] ?? 0) + 1;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get the actor address from the wallet.
   */
  private async getActorAddress(): Promise<string> {
    if (this.config.wallet) {
      return await this.config.wallet.getAddress();
    }
    return '0x0000000000000000000000000000000000000000';
  }

  /**
   * Infer action category from action type.
   */
  private inferCategory(action: ActionInput): ActionCategory {
    const type = action.type.toLowerCase();

    if (type.includes('transfer') || type.includes('send')) {
      return 'TRANSFER';
    }
    if (type.includes('swap') || type.includes('exchange')) {
      return 'SWAP';
    }
    if (type.includes('approve') || type.includes('allowance')) {
      return 'APPROVE';
    }
    if (type.includes('bridge')) {
      return 'BRIDGE';
    }
    if (type.includes('call') || type.includes('execute')) {
      return 'CALL';
    }

    return 'CUSTOM';
  }

  /**
   * Reset daily stats if it's a new day.
   */
  private maybeResetDailyStats(): void {
    const today = new Date().toISOString().split('T')[0] ?? '';
    if (today !== this.lastStatsResetDate) {
      this.dailyStats = {
        actionCount: 0,
        totalValue: 0n,
        byCategory: {},
      };
      this.lastStatsResetDate = today;
    }
  }
}
