import type { InvarianceConfig, SpecPolicy, EscrowContract } from '@invariance/common';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey, mnemonicToAccount } from 'viem/accounts';
import { ContractFactory } from './ContractFactory.js';
import { InvarianceEventEmitter } from './EventEmitter.js';
import type {
  QuickSetupOptions,
  QuickSetupResult,
  HireAndFundOptions,
  BatchRegisterOptions,
  BatchRegisterEntry,
  ExecuteAndLogOptions,
  ExecuteAndLogResult,
  RecurringPaymentOptions,
  CreateMultiSigOptions,
  SetupRateLimitedAgentOptions,
  HireAndReviewOptions,
  HireAndReviewResult,
  AuditOptions,
  AuditReport,
  DelegateOptions,
  DelegateResult,
  DeferredOperation,
  BatchOptions,
  BatchResult,
  SessionOptions,
} from './convenience-types.js';
import { BatchExecutor } from './BatchExecutor.js';
import { SessionContext } from './SessionContext.js';
import { PipelineBuilder } from './PipelineBuilder.js';
import { Telemetry } from './Telemetry.js';
import { loadEnvConfig } from './env.js';
import { IdentityManager } from '../modules/identity/IdentityManager.js';
import { WalletManager } from '../modules/wallet/WalletManager.js';
import { IntentProtocol } from '../modules/intent/IntentProtocol.js';
import { PolicyEngine } from '../modules/policy/PolicyEngine.js';
import { EscrowManager } from '../modules/escrow/EscrowManager.js';
import { EventLedger } from '../modules/ledger/EventLedger.js';
import { EventLedgerCompact } from '../modules/ledger/EventLedgerCompact.js';
import { AutoBatchedEventLedgerCompact } from '../modules/ledger/AutoBatchedEventLedgerCompact.js';
import type { AutoBatchConfig } from '../modules/ledger/types.js';
import { Verifier } from '../modules/verify/Verifier.js';
import { AtomicVerifier } from '../modules/verify/AtomicVerifier.js';
import { ReputationEngine } from '../modules/reputation/ReputationEngine.js';
import { GasManager } from '../modules/gas/GasManager.js';
import { X402Manager } from '../modules/x402/X402Manager.js';
import { ERC8004Manager } from '../modules/erc8004/ERC8004Manager.js';
import { InvarianceBridge } from '../modules/erc8004/InvarianceBridge.js';
import { MarketplaceKit } from '../modules/marketplace/MarketplaceKit.js';
import type { VerificationResult } from '../modules/verify/types.js';
import { AuditTrail } from '../modules/audit/AuditTrail.js';
import type { GateActionOptions, GateActionResult } from '../modules/audit/types.js';

declare const __SDK_VERSION__: string;

/**
 * Current SDK version, injected at build time via tsup define.
 */
export const SDK_VERSION: string = __SDK_VERSION__;

/**
 * The callable verify interface.
 *
 * Supports both `inv.verify(txHash)` direct call syntax
 * and sub-methods like `inv.verify.action()`.
 */
export interface VerifyProxy extends Verifier {
  (txHash: string): Promise<VerificationResult>;
}

/**
 * The main entry point for the Invariance SDK.
 *
 * Lazily initializes all 12 module managers and exposes them as properties.
 * The constructor validates chain configuration and contract availability.
 *
 * @example
 * ```typescript
 * import { Invariance } from '@invariance/sdk';
 *
 * // Self-hosted
 * const inv = new Invariance({
 *   chain: 'base',
 *   rpcUrl: 'https://mainnet.base.org',
 *   signer: wallet,
 * });
 *
 * // Managed hosting
 * const inv = new Invariance({
 *   apiKey: 'inv_live_xxx',
 *   chain: 'base',
 * });
 *
 * // Register an identity
 * const agent = await inv.identity.register({
 *   type: 'agent',
 *   owner: '0xDev',
 *   label: 'TraderBot',
 * });
 *
 * // Execute a verified intent
 * const result = await inv.intent.request({
 *   actor: { type: 'agent', address: agent.address },
 *   action: 'swap',
 *   params: { from: 'USDC', to: 'ETH', amount: '100' },
 *   approval: 'auto',
 * });
 *
 * // Verify any transaction
 * const verification = await inv.verify('0xtxhash...');
 * ```
 */
export class Invariance {
  private readonly config: InvarianceConfig;
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;

  // Lazy-initialized module instances
  private _identity?: IdentityManager;
  private _wallet?: WalletManager;
  private _walletInitPromise?: Promise<void> | undefined;
  private _intent?: IntentProtocol;
  private _policy?: PolicyEngine;
  private _escrow?: EscrowManager;
  private _ledger?: EventLedger;
  private _ledgerCompact?: EventLedgerCompact;
  private _verify?: VerifyProxy;
  private _atomic?: AtomicVerifier;
  private _reputation?: ReputationEngine;
  private _gas?: GasManager;
  private _x402?: X402Manager;
  private _erc8004?: ERC8004Manager;
  private _erc8004Bridge?: InvarianceBridge;
  private _marketplace?: MarketplaceKit;
  private _auditTrail?: AuditTrail;

  // ===========================================================================
  // Static Factory Methods
  // ===========================================================================

  /**
   * Generate a fresh random wallet and return an Invariance client.
   *
   * @example
   * ```typescript
   * const inv = Invariance.createRandom({ chain: 'base-sepolia' });
   * console.log(inv.wallet.getAddress());
   * ```
   */
  static createRandom(config?: Partial<InvarianceConfig>): Invariance {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    return new Invariance({ ...config, signer: account });
  }

  /**
   * Create a client from a hex private key string.
   *
   * @param key - Hex private key (with or without 0x prefix)
   * @param config - Optional SDK configuration overrides
   *
   * @example
   * ```typescript
   * const inv = Invariance.fromPrivateKey('0xabc...', { chain: 'base-sepolia' });
   * ```
   */
  static fromPrivateKey(key: string, config?: Partial<InvarianceConfig>): Invariance {
    const hex = key.startsWith('0x') ? key : `0x${key}`;
    const account = privateKeyToAccount(hex as `0x${string}`);
    return new Invariance({ ...config, signer: account });
  }

  /**
   * Create a client from a BIP-39 mnemonic phrase.
   *
   * @param phrase - 12 or 24 word mnemonic
   * @param config - Optional SDK configuration overrides
   *
   * @example
   * ```typescript
   * const inv = Invariance.fromMnemonic('abandon abandon ... about', { chain: 'base' });
   * ```
   */
  static fromMnemonic(phrase: string, config?: Partial<InvarianceConfig>): Invariance {
    const account = mnemonicToAccount(phrase);
    return new Invariance({ ...config, signer: account });
  }

  constructor(config?: Partial<InvarianceConfig>) {
    const envConfig = loadEnvConfig();
    const merged = { ...envConfig, ...config } as InvarianceConfig;

    if (!merged.chain) {
      throw new Error(
        'No chain configured. Set INVARIANCE_CHAIN env var or pass { chain } in config.',
      );
    }

    this.config = merged;
    this.contracts = new ContractFactory(merged);
    this.events = new InvarianceEventEmitter();
    this.telemetry = new Telemetry(merged.telemetry === true);

    this.telemetry.track('sdk.init', {
      chain: merged.chain,
      managed: merged.apiKey !== undefined,
      gasStrategy: merged.gasStrategy ?? 'standard',
    });

    // Initialize wallet if signer provided
    if (merged.signer !== undefined) {
      const chain = merged.chain === 'base' ? base : baseSepolia;
      const rpcUrl = this.contracts.getRpcUrl();
      this._wallet = new WalletManager(this.contracts, this.telemetry, this.config);

      this._walletInitPromise = this._wallet.initFromSigner(merged.signer, rpcUrl, chain).then(() => {
        if (this._wallet!.isConnected()) {
          this.contracts.setClients(this._wallet!.getPublicClient(), this._wallet!.getWalletClient());
        }
      }).catch((err: unknown) => {
        console.error('[Invariance] Wallet initialization failed:', err instanceof Error ? err.message : String(err));
        // Clear the promise so subsequent calls to ensureWalletInit() don't hang
        this._walletInitPromise = undefined;
        throw err;
      });
    }
  }

  /**
   * Ensure wallet initialization is complete.
   * Call this before using any contract methods.
   *
   * @remarks
   * This is called automatically when accessing module getters,
   * so manual calls are rarely needed.
   */
  async ensureWalletInit(): Promise<void> {
    if (this._walletInitPromise) {
      await this._walletInitPromise;
    }
  }

  /**
   * Internal: ensure wallet init is complete.
   * Called automatically by module getters.
   * @internal
   */
  private _autoInit(): void {
    if (this._walletInitPromise) {
      // Attach a no-op catch to prevent unhandled rejection warnings.
      // For async providers (EIP-1193, Privy), callers should await ready()
      // or ensureWalletInit() before making contract calls.
      this._walletInitPromise.catch(() => {
        // Error already logged in the constructor .catch() handler
      });
    }
  }

  // ===========================================================================
  // Module Accessors (lazy initialization)
  // ===========================================================================

  /**
   * Identity management module.
   *
   * Register agents, humans, devices as verified identities.
   * 10 methods: register, get, resolve, update, pause, resume, deactivate, list, attest, attestations
   */
  get identity(): IdentityManager {
    this._autoInit();
    if (!this._identity) {
      this._identity = new IdentityManager(this.contracts, this.events, this.telemetry);
    }
    return this._identity;
  }

  /**
   * Ensure wallet is initialized before performing contract operations.
   * Automatically called internally; rarely needed by consumers.
   * @internal
   */
  async ready(): Promise<this> {
    await this.ensureWalletInit();
    return this;
  }

  /**
   * Wallet management module.
   *
   * Key management, embedded wallets via Privy.
   * 9 methods: create, connect, get, fund, balance, export, exportPrivateKey, signMessage, disconnect
   */
  get wallet(): WalletManager {
    this._autoInit();
    if (!this._wallet) {
      this._wallet = new WalletManager(this.contracts, this.telemetry, this.config);
    }
    return this._wallet;
  }

  /**
   * Intent Protocol module.
   *
   * Request -> Approve -> Execute -> Verify handshake.
   * 6 methods: request, prepare, approve, reject, status, history
   */
  get intent(): IntentProtocol {
    this._autoInit();
    if (!this._intent) {
      this._intent = new IntentProtocol(this.contracts, this.events, this.telemetry);
    }
    return this._intent;
  }

  /**
   * Policy Engine module.
   *
   * Composable, verifiable condition sets.
   * 9 methods: create, attach, detach, evaluate, revoke, status, list, compose, onViolation
   */
  get policy(): PolicyEngine {
    this._autoInit();
    if (!this._policy) {
      this._policy = new PolicyEngine(this.contracts, this.events, this.telemetry);
    }
    return this._policy;
  }

  /**
   * Escrow module.
   *
   * USDC escrow with multi-sig, conditional release.
   * 11 methods: create, fund, release, refund, dispute, resolve, approve, approvals, status, list, onStateChange
   */
  get escrow(): EscrowManager {
    this._autoInit();
    if (!this._escrow) {
      this._escrow = new EscrowManager(this.contracts, this.events, this.telemetry);
    }
    return this._escrow;
  }

  /**
   * Event Ledger module.
   *
   * Immutable on-chain logging with dual signatures.
   * 5 methods: log, batch, query, stream, export
   */
  get ledger(): EventLedger {
    this._autoInit();
    if (!this._ledger) {
      this._ledger = new EventLedger(this.contracts, this.events, this.telemetry);
    }
    return this._ledger;
  }

  /**
   * Compact Event Ledger module (fraud-proof).
   *
   * Uses CompactLedger with EIP-712 dual signatures verified on-chain.
   * Requires an API key for platform attestation.
   *
   * @example
   * ```typescript
   * const entry = await inv.ledgerCompact.log({
   *   action: 'model-inference',
   *   actor: { type: 'agent', address: '0xBot' },
   * });
   * ```
   */
  get ledgerCompact(): EventLedgerCompact {
    this._autoInit();
    if (!this._ledgerCompact) {
      this._ledgerCompact = new EventLedgerCompact(this.contracts, this.events, this.telemetry);
    }
    return this._ledgerCompact;
  }

  /**
   * Atomic Verifier module.
   *
   * Identity check + policy eval + CompactLedger log in a single transaction.
   * Requires an API key for platform attestation.
   *
   * @example
   * ```typescript
   * const entry = await inv.atomic.verifyAndLog({
   *   action: 'swap',
   *   actor: { type: 'agent', address: '0xBot' },
   * });
   * ```
   */
  get atomic(): AtomicVerifier {
    this._autoInit();
    if (!this._atomic) {
      this._atomic = new AtomicVerifier(this.contracts, this.events, this.telemetry);
    }
    return this._atomic;
  }

  /**
   * Verify module.
   *
   * Cryptographic verification + public explorer URLs.
   * Supports both direct call `inv.verify(txHash)` and sub-methods.
   * 7 methods: verify (callable), action, identity, escrow, proof, bulk, url
   */
  get verify(): VerifyProxy {
    this._autoInit();
    if (!this._verify) {
      const verifier = new Verifier(this.contracts, this.events, this.telemetry);

      // Create a callable proxy that delegates to verifier.verify()
      // while also exposing all Verifier methods as properties
      const callable = (async (txHash: string) => {
        return verifier.verify(txHash);
      }) as VerifyProxy;

      // Copy all Verifier methods onto the callable function
      callable.verify = verifier.verify.bind(verifier);
      callable.action = verifier.action.bind(verifier);
      callable.identity = verifier.identity.bind(verifier);
      callable.escrow = verifier.escrow.bind(verifier);
      callable.proof = verifier.proof.bind(verifier);
      callable.bulk = verifier.bulk.bind(verifier);
      callable.url = verifier.url.bind(verifier);

      this._verify = callable;
    }
    return this._verify;
  }

  /**
   * Reputation Engine module.
   *
   * Auto-calculated scores + 1-5 star reviews.
   * 7 methods: get, review, getReviews, score, compare, badge, history
   */
  get reputation(): ReputationEngine {
    this._autoInit();
    if (!this._reputation) {
      this._reputation = new ReputationEngine(this.contracts, this.events, this.telemetry);
    }
    return this._reputation;
  }

  /**
   * Gas management module.
   *
   * Gas abstraction (USDC-based).
   * 2 methods: estimate, balance
   */
  get gas(): GasManager {
    this._autoInit();
    if (!this._gas) {
      this._gas = new GasManager(this.contracts, this.events, this.telemetry);
    }
    return this._gas;
  }

  /**
   * X402 Payment Protocol module.
   *
   * Pay-per-action execution and agent-to-agent payments via x402.
   * 5 methods: payForAction, verifyPayment, history, estimateCost, configure
   */
  get x402(): X402Manager {
    this._autoInit();
    if (!this._x402) {
      this._x402 = new X402Manager(this.contracts, this.events, this.telemetry);
    }
    return this._x402;
  }

  /**
   * ERC-8004 (Trustless Agents) module.
   *
   * Standalone manager for on-chain agent identity, reputation, and validation.
   * Works without any Invariance contracts — just ERC-8004 registries.
   * 14 methods: register, getAgent, setMetadata, getMetadata, setAgentWallet,
   * setAgentURI, getGlobalId, giveFeedback, revokeFeedback, getSummary,
   * readFeedback, readAllFeedback, requestValidation, respondToValidation,
   * getValidationStatus, getValidationSummary
   */
  get erc8004(): ERC8004Manager {
    this._autoInit();
    if (!this._erc8004) {
      const chainId = this.contracts.getChainId();
      this._erc8004 = new ERC8004Manager({
        chainId,
        publicClient: this.contracts.getPublicClient(),
        walletClient: this.contracts.hasClients() ? this.contracts.getWalletClient() : undefined,
      });
    }
    return this._erc8004;
  }

  /**
   * ERC-8004 Bridge module.
   *
   * Optional bridge between ERC-8004 and Invariance modules.
   * Links identities, bridges reputation, enables cross-protocol validation.
   * 6 methods: linkIdentity, getLinkedIdentity, unlinkIdentity,
   * pullERC8004Reputation, pushFeedbackFromLedger, actAsValidator,
   * requestInvarianceValidation
   */
  get erc8004Bridge(): InvarianceBridge {
    this._autoInit();
    if (!this._erc8004Bridge) {
      this._erc8004Bridge = new InvarianceBridge(
        this.erc8004,
        this.identity,
        this.ledger,
        this.contracts,
        this.events,
        this.telemetry,
      );
    }
    return this._erc8004Bridge;
  }

  /**
   * Marketplace Kit module.
   *
   * Pre-built primitives for verified marketplaces: list, search, hire, complete.
   * 8 methods: register, update, deactivate, search, get, featured, hire, complete
   */
  get marketplace(): MarketplaceKit {
    this._autoInit();
    if (!this._marketplace) {
      this._marketplace = new MarketplaceKit(this.contracts, this.events, this.telemetry);
    }
    return this._marketplace;
  }

  /**
   * Off-chain-first audit module with optional on-chain anchoring.
   *
   * Wallet account integrations remain unchanged: actor identity and signer
   * flow still use the configured wallet/account providers.
   */
  get auditTrail(): AuditTrail {
    this._autoInit();
    if (!this._auditTrail) {
      this._auditTrail = new AuditTrail(
        this.contracts,
        this.events,
        this.telemetry,
        this.ledger,
        this.config.audit,
      );
    }
    return this._auditTrail;
  }

  /**
   * Create an auto-batching compact ledger that buffers `log()` calls
   * and flushes them as a single `logBatch()` transaction for ~85% gas savings.
   *
   * @param config - Batch configuration (maxBatchSize, maxWaitMs, enabled)
   * @returns Auto-batching compact ledger wrapper
   *
   * @example
   * ```typescript
   * const batched = inv.ledgerCompactBatched({ maxBatchSize: 10, maxWaitMs: 5000 });
   * await Promise.all(events.map(e => batched.log(e))); // 1 tx instead of N
   * await batched.destroy(); // flush remaining + cleanup
   * ```
   */
  ledgerCompactBatched(config?: AutoBatchConfig): AutoBatchedEventLedgerCompact {
    this._autoInit();
    return new AutoBatchedEventLedgerCompact(this.contracts, this.events, this.telemetry, config);
  }

  // ===========================================================================
  // Convenience Methods (high-level workflows)
  // ===========================================================================

  /**
   * Register an identity, create a policy, and attach it in one call.
   *
   * @param opts - Identity and policy options
   * @returns The created identity and attached policy
   *
   * @example
   * ```typescript
   * const { identity, policy } = await inv.quickSetup({
   *   identity: { type: 'agent', owner: '0xDev', label: 'TraderBot' },
   *   policy: { name: 'trading-limits', rules: [{ type: 'max-spend', config: { amount: '1000' } }] },
   * });
   * ```
   */
  async quickSetup(opts: QuickSetupOptions): Promise<QuickSetupResult> {
    const identity = await this.identity.register(opts.identity);

    let policy: SpecPolicy;
    if (opts.policyTemplate) {
      policy = await this.policy.fromTemplate(opts.policyTemplate);
    } else if (opts.policy) {
      policy = await this.policy.create(opts.policy);
    } else {
      throw new Error('quickSetup requires either policy or policyTemplate');
    }

    await this.policy.attach(policy.policyId, identity.identityId);

    const result: QuickSetupResult = { identity, policy };

    if (opts.fund) {
      const walletAddress = this.wallet.getAddress();
      await this.wallet.fund(walletAddress, { amount: opts.fund.amount, token: opts.fund.token });
      result.funded = true;
    }

    return result;
  }

  /**
   * Hire from a marketplace listing and auto-fund the escrow.
   *
   * @param opts - Hire options with optional fund amount override
   * @returns Hire result with funded escrow
   *
   * @example
   * ```typescript
   * const result = await inv.hireAndFund({
   *   listingId: 'listing-123',
   *   task: { description: 'Label 1000 images', deadline: '2025-06-01' },
   *   payment: { amount: '500', type: 'escrow' },
   * });
   * ```
   */
  async hireAndFund(opts: HireAndFundOptions): Promise<import('@invariance/common').HireResult> {
    const result = await this.marketplace.hire(opts);
    await this.escrow.fund(result.escrowId);
    return result;
  }

  /**
   * Register multiple agents with a shared policy in one call.
   *
   * @param opts - Batch of agents and a shared policy
   * @returns Array of registered identities with attached policies
   *
   * @example
   * ```typescript
   * const agents = await inv.batchRegister({
   *   agents: [
   *     { identity: { type: 'agent', owner: '0xDev', label: 'Worker-1' } },
   *     { identity: { type: 'agent', owner: '0xDev', label: 'Worker-2' } },
   *   ],
   *   sharedPolicy: { name: 'worker-policy', rules: [{ type: 'rate-limit', config: { max: 100, window: 'PT1H' } }] },
   * });
   * ```
   */
  async batchRegister(opts: BatchRegisterOptions): Promise<BatchRegisterEntry[]> {
    const sharedPolicy = await this.policy.create(opts.sharedPolicy);
    const results: BatchRegisterEntry[] = [];

    for (const agent of opts.agents) {
      const identity = await this.identity.register(agent.identity);
      let policy = sharedPolicy;
      if (agent.policyOverride) {
        policy = await this.policy.create(agent.policyOverride);
      }
      await this.policy.attach(policy.policyId, identity.identityId);
      results.push({ identity, policy });
    }

    return results;
  }

  /**
   * Execute an intent and log a custom ledger event in one call.
   *
   * @param opts - Intent request options and ledger event input
   * @returns The intent result and logged ledger entry
   *
   * @example
   * ```typescript
   * const { intent, log } = await inv.executeAndLog({
   *   intent: {
   *     actor: { type: 'agent', address: '0xAgent' },
   *     action: 'moderate',
   *     params: { contentId: 'post-456' },
   *     approval: 'auto',
   *   },
   *   log: {
   *     action: 'content-moderated',
   *     actor: { type: 'agent', address: '0xAgent' },
   *     category: 'custom',
   *     metadata: { contentId: 'post-456', verdict: 'approved' },
   *   },
   * });
   * ```
   */
  async executeAndLog(opts: ExecuteAndLogOptions): Promise<ExecuteAndLogResult> {
    const intent = await this.intent.request(opts.intent);
    const log = await this.ledger.log(opts.log);
    return { intent, log };
  }

  /**
   * Gate any async action through SDK lifecycle + audit logging.
   *
   * Defaults to off-chain logging via infrastructure APIs. Per-action mode can
   * be overridden with `opts.mode` (`offchain`, `onchain`, or `dual`).
   */
  async gateAction<T>(opts: GateActionOptions, executor: () => Promise<T>): Promise<GateActionResult<T>> {
    return this.auditTrail.gate(opts, executor);
  }

  /**
   * Create a policy configured for recurring payments with time-window rules.
   *
   * @param opts - Recurring payment configuration
   * @returns The created policy
   *
   * @example
   * ```typescript
   * const policy = await inv.recurringPayment({
   *   name: 'monthly-subscription',
   *   amount: '50',
   *   recipient: '0xService',
   *   interval: 'P1M',
   *   maxPayments: 12,
   * });
   * ```
   */
  async recurringPayment(opts: RecurringPaymentOptions): Promise<SpecPolicy> {
    const rules: import('@invariance/common').PolicyRule[] = [
      {
        type: 'require-payment',
        config: {
          minAmount: opts.amount,
          recipient: opts.recipient,
          perAction: true,
        },
      },
      {
        type: 'time-window',
        config: {
          interval: opts.interval,
          maxExecutions: opts.maxPayments,
        },
      },
    ];

    if (opts.allowedActions) {
      rules.push({
        type: 'action-whitelist',
        config: { actions: opts.allowedActions },
      });
    }

    const policyOpts: import('@invariance/common').CreatePolicyOptions = {
      name: opts.name,
      rules,
    };
    if (opts.actor !== undefined) policyOpts.actor = opts.actor;
    if (opts.expiry !== undefined) policyOpts.expiry = opts.expiry;

    return this.policy.create(policyOpts);
  }

  /**
   * Create a multi-sig escrow with simplified options.
   *
   * @param opts - Multi-sig escrow configuration
   * @returns The created escrow contract
   *
   * @example
   * ```typescript
   * const escrow = await inv.createMultiSig({
   *   amount: '10000',
   *   recipient: { type: 'agent', address: '0xAgent' },
   *   signers: ['0xSigner1', '0xSigner2', '0xSigner3'],
   *   threshold: 2,
   * });
   * ```
   */
  async createMultiSig(opts: CreateMultiSigOptions): Promise<EscrowContract> {
    const multiSig: import('@invariance/common').MultiSigConfig = {
      signers: opts.signers,
      threshold: opts.threshold,
    };
    if (opts.timeoutPerSigner !== undefined) multiSig.timeoutPerSigner = opts.timeoutPerSigner;

    const escrowOpts: import('@invariance/common').CreateEscrowOptions = {
      amount: opts.amount,
      recipient: opts.recipient,
      conditions: {
        type: 'multi-sig',
        timeout: opts.timeout ?? 'P30D',
        multiSig,
      },
    };
    if (opts.autoFund !== undefined) escrowOpts.autoFund = opts.autoFund;

    return this.escrow.create(escrowOpts);
  }

  /**
   * Register an agent with rate-limit and cooldown policies pre-configured.
   *
   * @param opts - Agent identity and rate limit configuration
   * @returns The created identity and rate-limit policy
   *
   * @example
   * ```typescript
   * const { identity, policy } = await inv.setupRateLimitedAgent({
   *   identity: { type: 'agent', owner: '0xDev', label: 'SupportBot' },
   *   maxActions: 100,
   *   window: 'PT1H',
   *   cooldown: 'PT5S',
   *   allowedActions: ['reply', 'escalate', 'close'],
   * });
   * ```
   */
  async setupRateLimitedAgent(opts: SetupRateLimitedAgentOptions): Promise<QuickSetupResult> {
    const rules: import('@invariance/common').PolicyRule[] = [
      {
        type: 'rate-limit',
        config: { max: opts.maxActions, window: opts.window },
      },
    ];

    if (opts.cooldown) {
      rules.push({ type: 'cooldown', config: { duration: opts.cooldown } });
    }

    if (opts.allowedActions) {
      rules.push({ type: 'action-whitelist', config: { actions: opts.allowedActions } });
    }

    if (opts.maxSpend) {
      rules.push({ type: 'max-spend', config: { amount: opts.maxSpend } });
    }

    return this.quickSetup({
      identity: opts.identity,
      policy: {
        name: `${opts.identity.label}-rate-limit`,
        rules,
      },
    });
  }

  /**
   * Complete the full hire → complete → review flow in one call.
   *
   * @param opts - Hire, completion, and review options
   * @returns Combined result with hire, completion, and review data
   *
   * @example
   * ```typescript
   * const result = await inv.hireAndReview({
   *   hire: {
   *     listingId: 'listing-123',
   *     task: { description: 'Analyze dataset', deadline: '2025-06-01' },
   *     payment: { amount: '200', type: 'escrow' },
   *   },
   *   review: { rating: 5, comment: 'Excellent work' },
   * });
   * ```
   */
  async hireAndReview(opts: HireAndReviewOptions): Promise<HireAndReviewResult> {
    const hireAndFundOpts: HireAndFundOptions = { ...opts.hire };
    if (opts.fundAmount !== undefined) hireAndFundOpts.fundAmount = opts.fundAmount;
    const hire = await this.hireAndFund(hireAndFundOpts);
    const completion = await this.marketplace.complete(hire.hireId, {
      review: opts.review,
    });
    return {
      hire,
      completion,
      review: {
        reviewId: completion.reviewId,
        updatedReputation: completion.updatedReputation,
      },
    };
  }

  /**
   * Query ledger entries, optionally verify each one, and export a report.
   *
   * @param opts - Audit query filters and options
   * @returns Audit report with entries, verification results, and optional export
   *
   * @example
   * ```typescript
   * const report = await inv.audit({
   *   actor: '0xAgent',
   *   from: '2025-01-01',
   *   to: '2025-06-01',
   *   verify: true,
   *   exportFormat: 'json',
   * });
   * console.log(`${report.verifiedCount}/${report.totalEntries} entries verified`);
   * ```
   */
  async audit(opts: AuditOptions): Promise<AuditReport> {
    const { verify: shouldVerify, exportFormat, ...filters } = opts;
    const entries = await this.ledger.query(filters);
    const failedVerifications: AuditReport['failedVerifications'] = [];
    let verifiedCount = 0;

    if (shouldVerify) {
      for (const entry of entries) {
        try {
          const result = await this.verify(entry.txHash);
          if (result.verified) {
            verifiedCount++;
          } else {
            failedVerifications.push({
              entryId: entry.entryId,
              error: 'Verification returned invalid',
            });
          }
        } catch (err) {
          failedVerifications.push({
            entryId: entry.entryId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const report: AuditReport = {
      entries,
      totalEntries: entries.length,
      verifiedCount,
      failedVerifications,
      generatedAt: Date.now(),
    };

    if (exportFormat) {
      report.exported = await this.ledger.export(filters);
    }

    return report;
  }

  /**
   * Create a scoped child policy for agent-to-agent delegation.
   *
   * @param opts - Delegation scope and agent identifiers
   * @returns The delegation policy and intent recording the delegation
   *
   * @example
   * ```typescript
   * const { policy, intent } = await inv.delegate({
   *   from: 'identity-orchestrator',
   *   to: 'identity-worker',
   *   scope: {
   *     actions: ['fetch-data', 'transform'],
   *     maxSpend: '50',
   *     expiry: '2025-06-01T00:00:00Z',
   *   },
   * });
   * ```
   */
  async delegate(opts: DelegateOptions): Promise<DelegateResult> {
    const rules: import('@invariance/common').PolicyRule[] = [
      { type: 'action-whitelist', config: { actions: opts.scope.actions } },
    ];

    if (opts.scope.maxSpend) {
      rules.push({ type: 'max-spend', config: { amount: opts.scope.maxSpend } });
    }

    if (opts.scope.additionalRules) {
      rules.push(...opts.scope.additionalRules);
    }

    const delegationPolicyOpts: import('@invariance/common').CreatePolicyOptions = {
      name: `delegation-${opts.from}-to-${opts.to}`,
      rules,
    };
    if (opts.scope.expiry !== undefined) delegationPolicyOpts.expiry = opts.scope.expiry;

    const policy = await this.policy.create(delegationPolicyOpts);

    await this.policy.attach(policy.policyId, opts.to);

    const fromIdentity = await this.identity.get(opts.from);
    const intent = await this.intent.request({
      actor: { type: fromIdentity.type, address: fromIdentity.address },
      action: 'delegate',
      params: {
        delegateTo: opts.to,
        policyId: policy.policyId,
        scope: opts.scope,
      },
      approval: 'auto',
    });

    return { policy, intent };
  }

  // ===========================================================================
  // Convenience Layer — Batch, Session, Pipeline, Hooks
  // ===========================================================================

  /**
   * Execute multiple operations with concurrency control and error handling.
   *
   * @param operations - Operations to execute
   * @param options - Batch execution options
   * @returns Aggregated results with success/failure counts
   *
   * @example
   * ```typescript
   * const results = await inv.batch([
   *   { execute: () => inv.identity.register({...}), description: 'Register Bot1' },
   *   { execute: () => inv.identity.register({...}), description: 'Register Bot2' },
   * ], { continueOnError: true, maxConcurrency: 3 });
   * ```
   */
  async batch<T = unknown>(operations: DeferredOperation<T>[], options?: BatchOptions): Promise<BatchResult<T>> {
    const executor = new BatchExecutor();
    return executor.execute(operations, options);
  }

  /**
   * Create a session context bound to a specific actor.
   *
   * All operations on the returned session automatically use the bound actor.
   *
   * @param options - Session options with actor reference
   * @returns Session context with actor-scoped methods
   *
   * @example
   * ```typescript
   * const session = inv.session({ actor: { type: 'agent', address: '0xBot' } });
   * await session.requestIntent({ action: 'swap', params: {...} });
   * ```
   */
  session(options: SessionOptions): SessionContext {
    return new SessionContext(this, options);
  }

  /**
   * Create a fluent pipeline builder for multi-step workflows.
   *
   * @returns Pipeline builder with chainable methods
   *
   * @example
   * ```typescript
   * const result = await inv.pipeline()
   *   .register({ type: 'agent', label: 'Bot', owner: '0x...' })
   *   .createPolicy({ template: 'defi-trading' })
   *   .attachPolicy()
   *   .execute();
   * ```
   */
  pipeline(): PipelineBuilder {
    return new PipelineBuilder(this);
  }

  /**
   * Register a callback to run before every intent action.
   *
   * @param callback - Called before each action with action details
   * @returns Unsubscribe function
   */
  beforeAction(callback: (data: import('./EventEmitter.js').InvarianceEvents['action.before']) => void): () => void {
    return this.events.on('action.before', callback);
  }

  /**
   * Register a callback to run after every intent action.
   *
   * @param callback - Called after each action with result details
   * @returns Unsubscribe function
   */
  afterAction(callback: (data: import('./EventEmitter.js').InvarianceEvents['action.after']) => void): () => void {
    return this.events.on('action.after', callback);
  }

  /**
   * Register a callback for policy violation events.
   *
   * @param callback - Called when a violation occurs
   * @returns Unsubscribe function
   */
  onViolation(callback: (data: import('./EventEmitter.js').InvarianceEvents['action.violation']) => void): () => void {
    return this.events.on('action.violation', callback);
  }

  /**
   * Register a callback for error events.
   *
   * @param callback - Called when an error occurs
   * @returns Unsubscribe function
   */
  onError(callback: (data: import('./EventEmitter.js').InvarianceEvents['action.error']) => void): () => void {
    return this.events.on('action.error', callback);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the raw configuration object.
   */
  getConfig(): InvarianceConfig {
    const redacted: InvarianceConfig = { ...this.config };
    delete (redacted as Partial<InvarianceConfig>).signer;
    if (redacted.apiKey) redacted.apiKey = '[REDACTED]';
    if (redacted.privy) {
      redacted.privy = { ...redacted.privy };
      if (redacted.privy.appSecret) redacted.privy.appSecret = '[REDACTED]';
    }
    return redacted;
  }

  /**
   * Get the current SDK version.
   */
  get version(): string {
    return SDK_VERSION;
  }

  /**
   * Get the chain configuration.
   */
  getChainConfig() {
    return this.contracts.getChainConfig();
  }

  /**
   * Get all contract addresses for the current chain.
   */
  getContractAddresses() {
    return this.contracts.getAddresses();
  }

  /**
   * Get the explorer base URL.
   */
  getExplorerBaseUrl(): string {
    return this.contracts.getExplorerBaseUrl();
  }

  /**
   * Subscribe to SDK-level events.
   *
   * @param event - Event name
   * @param listener - Callback
   * @returns Unsubscribe function
   */
  on<K extends keyof import('./EventEmitter.js').InvarianceEvents>(
    event: K,
    listener: (data: import('./EventEmitter.js').InvarianceEvents[K]) => void,
  ): () => void {
    return this.events.on(event, listener);
  }
}
