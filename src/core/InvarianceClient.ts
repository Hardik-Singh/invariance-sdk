import type { InvarianceConfig } from '@invariance/common';
import { base, baseSepolia } from 'viem/chains';
import { ContractFactory } from './ContractFactory.js';
import { InvarianceEventEmitter } from './EventEmitter.js';
import { Telemetry } from './Telemetry.js';
import { IdentityManager } from '../modules/identity/IdentityManager.js';
import { WalletManager } from '../modules/wallet/WalletManager.js';
import { IntentProtocol } from '../modules/intent/IntentProtocol.js';
import { PolicyEngine } from '../modules/policy/PolicyEngine.js';
import { EscrowManager } from '../modules/escrow/EscrowManager.js';
import { EventLedger } from '../modules/ledger/EventLedger.js';
import { Verifier } from '../modules/verify/Verifier.js';
import { ReputationEngine } from '../modules/reputation/ReputationEngine.js';
import { MarketplaceKit } from '../modules/marketplace/MarketplaceKit.js';
import { GasManager } from '../modules/gas/GasManager.js';
import { WebhookManager } from '../modules/webhooks/WebhookManager.js';
import { X402Manager } from '../modules/x402/X402Manager.js';
import { ERC8004Manager } from '../modules/erc8004/ERC8004Manager.js';
import { InvarianceBridge } from '../modules/erc8004/InvarianceBridge.js';
import type { VerificationResult } from '../modules/verify/types.js';

/**
 * Current SDK version.
 */
export const SDK_VERSION = '2.0.0';

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
  private _verify?: VerifyProxy;
  private _reputation?: ReputationEngine;
  private _marketplace?: MarketplaceKit;
  private _gas?: GasManager;
  private _webhooks?: WebhookManager;
  private _x402?: X402Manager;
  private _erc8004?: ERC8004Manager;
  private _erc8004Bridge?: InvarianceBridge;

  constructor(config: InvarianceConfig) {
    this.config = config;
    this.contracts = new ContractFactory(config);
    this.events = new InvarianceEventEmitter();
    this.telemetry = new Telemetry(config.telemetry !== false);

    this.telemetry.track('sdk.init', {
      chain: config.chain,
      managed: config.apiKey !== undefined,
      gasStrategy: config.gasStrategy ?? 'standard',
    });

    // Initialize wallet if signer provided
    if (config.signer !== undefined) {
      const chain = config.chain === 'base' ? base : baseSepolia;
      const rpcUrl = this.contracts.getRpcUrl();
      this._wallet = new WalletManager(this.contracts, this.events, this.telemetry);
      this._walletInitPromise = this._wallet.initFromSigner(config.signer, rpcUrl, chain).then(() => {
        if (this._wallet!.isConnected()) {
          this.contracts.setClients(this._wallet!.getPublicClient(), this._wallet!.getWalletClient());
        }
      });
    }
  }

  /**
   * Ensure wallet initialization is complete.
   * Call this before using any contract methods.
   */
  async ensureWalletInit(): Promise<void> {
    if (this._walletInitPromise) {
      await this._walletInitPromise;
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
    if (!this._identity) {
      this._identity = new IdentityManager(this.contracts, this.events, this.telemetry);
    }
    return this._identity;
  }

  /**
   * Wallet management module.
   *
   * Key management, embedded wallets via Privy.
   * 6 methods: create, connect, get, fund, balance, export
   */
  get wallet(): WalletManager {
    if (!this._wallet) {
      this._wallet = new WalletManager(this.contracts, this.events, this.telemetry);
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
    if (!this._ledger) {
      this._ledger = new EventLedger(this.contracts, this.events, this.telemetry);
    }
    return this._ledger;
  }

  /**
   * Verify module.
   *
   * Cryptographic verification + public explorer URLs.
   * Supports both direct call `inv.verify(txHash)` and sub-methods.
   * 7 methods: verify (callable), action, identity, escrow, proof, bulk, url
   */
  get verify(): VerifyProxy {
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
    if (!this._reputation) {
      this._reputation = new ReputationEngine(this.contracts, this.events, this.telemetry);
    }
    return this._reputation;
  }

  /**
   * Marketplace Kit module.
   *
   * Agent listing, search, hire, review lifecycle.
   * 8 methods: register, update, deactivate, search, get, featured, hire, complete
   */
  get marketplace(): MarketplaceKit {
    if (!this._marketplace) {
      this._marketplace = new MarketplaceKit(this.contracts, this.events, this.telemetry);
    }
    return this._marketplace;
  }

  /**
   * Gas management module.
   *
   * Gas abstraction (USDC-based).
   * 2 methods: estimate, balance
   */
  get gas(): GasManager {
    if (!this._gas) {
      this._gas = new GasManager(this.contracts, this.events, this.telemetry);
    }
    return this._gas;
  }

  /**
   * Webhook management module.
   *
   * Server-side event notifications.
   * 6 methods: register, update, delete, list, test, logs
   */
  get webhooks(): WebhookManager {
    if (!this._webhooks) {
      this._webhooks = new WebhookManager(this.contracts, this.events, this.telemetry);
    }
    return this._webhooks;
  }

  /**
   * X402 Payment Protocol module.
   *
   * Pay-per-action execution and agent-to-agent payments via x402.
   * 5 methods: payForAction, verifyPayment, history, estimateCost, configure
   */
  get x402(): X402Manager {
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

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the raw configuration object.
   */
  getConfig(): InvarianceConfig {
    return this.config;
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
