import {
  createWalletClient,
  createPublicClient,
  http,
  custom,
  formatEther,
  type WalletClient,
  type PublicClient,
  type Account,
  type Chain,
} from 'viem';
import type { ContractFactory } from '../../core/ContractFactory.js';
import type { Telemetry } from '../../core/Telemetry.js';
import type { EIP1193Provider, InvarianceSigner } from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type { WalletInfo, BalanceInfo, WalletProvider, FundOptions, CreateWalletOptions } from './types.js';
import type { TxReceipt, ExportData } from '@invariance/common';

/**
 * Handles wallet management for all identity types.
 *
 * Accepts any wallet type: viem Account, WalletClient, EIP-1193 provider,
 * or custom InvarianceSigner. Normalizes to viem WalletClient internally.
 *
 * @example
 * ```typescript
 * const inv = new Invariance({
 *   chain: 'base',
 *   signer: privateKeyToAccount('0x...'),
 * });
 * const balance = await inv.wallet.balance();
 * ```
 */
export class WalletManager {
  private readonly contracts: ContractFactory;
  private readonly telemetry: Telemetry;
  private walletClient: WalletClient | null = null;
  private publicClient: PublicClient | null = null;
  private address: `0x${string}` | null = null;
  private detectedProvider: WalletProvider = 'raw';

  constructor(
    contracts: ContractFactory,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.telemetry = telemetry;
  }

  /**
   * Initialize from a signer provided in config.
   * Detects type and normalizes to viem WalletClient.
   */
  async initFromSigner(signer: unknown, rpcUrl: string, chain: Chain): Promise<void> {
    if (this.isViemAccount(signer)) {
      this.detectedProvider = 'raw';
      const account = signer as Account;
      this.walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
      this.address = account.address;
    } else if (this.isWalletClient(signer)) {
      this.detectedProvider = 'custom';
      this.walletClient = signer as WalletClient;
      const addresses = await this.walletClient.getAddresses();
      const firstAddr = addresses[0];
      if (!firstAddr) {
        throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'WalletClient has no addresses');
      }
      this.address = firstAddr;
    } else if (this.isEIP1193Provider(signer)) {
      this.detectedProvider = 'metamask';
      const provider = signer as EIP1193Provider;
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const firstAccount = accounts[0];
      if (!firstAccount) {
        throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'No accounts returned from provider');
      }
      this.address = firstAccount as `0x${string}`;
      this.walletClient = createWalletClient({
        account: this.address,
        chain,
        transport: custom(provider),
      });
    } else if (this.isInvarianceSigner(signer)) {
      this.detectedProvider = 'custom';
      const invSigner = signer as InvarianceSigner;
      const addr = await invSigner.getAddress();
      this.address = addr as `0x${string}`;
      this.walletClient = createWalletClient({
        account: this.address,
        chain,
        transport: http(rpcUrl),
      });
    } else {
      throw new InvarianceError(
        ErrorCode.WALLET_NOT_CONNECTED,
        'Unrecognized signer type. Provide a viem Account, WalletClient, EIP-1193 provider, or InvarianceSigner.',
      );
    }

    this.publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  }

  // =========================================================================
  // Type Guards
  // =========================================================================

  private isViemAccount(signer: unknown): boolean {
    return (
      typeof signer === 'object' &&
      signer !== null &&
      'address' in signer &&
      'signMessage' in signer &&
      'type' in signer
    );
  }

  private isWalletClient(signer: unknown): boolean {
    return (
      typeof signer === 'object' &&
      signer !== null &&
      'transport' in signer &&
      'getAddresses' in signer &&
      typeof (signer as Record<string, unknown>)['getAddresses'] === 'function'
    );
  }

  private isEIP1193Provider(signer: unknown): boolean {
    return (
      typeof signer === 'object' &&
      signer !== null &&
      'request' in signer &&
      typeof (signer as Record<string, unknown>)['request'] === 'function' &&
      !('transport' in signer)
    );
  }

  private isInvarianceSigner(signer: unknown): boolean {
    return (
      typeof signer === 'object' &&
      signer !== null &&
      'getAddress' in signer &&
      'signMessage' in signer &&
      'signTypedData' in signer &&
      typeof (signer as Record<string, unknown>)['getAddress'] === 'function'
    );
  }

  // =========================================================================
  // Internal Helpers
  // =========================================================================

  private requireWallet(): void {
    if (!this.walletClient || !this.address) {
      throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'No wallet connected. Provide a signer in config.');
    }
  }

  private requirePublicClient(): PublicClient {
    if (!this.publicClient) {
      throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Public client not initialized.');
    }
    return this.publicClient;
  }

  // =========================================================================
  // Accessors
  // =========================================================================

  /** Get the wallet address */
  getAddress(): `0x${string}` {
    this.requireWallet();
    return this.address!;
  }

  /** Get the underlying viem WalletClient */
  getWalletClient(): WalletClient {
    this.requireWallet();
    return this.walletClient!;
  }

  /** Get the public client for read operations */
  getPublicClient(): PublicClient {
    return this.requirePublicClient();
  }

  /** Check if a wallet is connected */
  isConnected(): boolean {
    return this.walletClient !== null && this.address !== null;
  }

  // =========================================================================
  // Public API (backwards compatible)
  // =========================================================================

  /**
   * Create an embedded wallet.
   * @param _opts - Optional wallet creation options
   */
  async create(_opts?: CreateWalletOptions): Promise<WalletInfo> {
    this.telemetry.track('wallet.create');
    throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Wallet creation not supported. Provide a signer in config.');
  }

  /** Connect an injected wallet */
  async connect(): Promise<WalletInfo> {
    this.telemetry.track('wallet.connect');
    throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Use initFromSigner() or provide signer in config.');
  }

  /** Get the current wallet info */
  async get(): Promise<WalletInfo> {
    this.telemetry.track('wallet.get');
    this.requireWallet();
    return {
      address: this.address!,
      provider: this.detectedProvider,
      chainId: this.contracts.getChainId(),
      connected: true,
      isSmartAccount: false,
    };
  }

  /**
   * Send USDC to a wallet address.
   * @param _address - The recipient address
   * @param opts - Fund options including amount
   */
  async fund(_address: string, opts: FundOptions): Promise<TxReceipt> {
    this.telemetry.track('wallet.fund', { token: opts.token ?? 'USDC' });
    this.requireWallet();
    throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'Fund not yet implemented.');
  }

  /**
   * Get USDC and ETH balances for an address.
   * @param address - The address to check (defaults to current wallet)
   */
  async balance(address?: string | undefined): Promise<BalanceInfo> {
    this.telemetry.track('wallet.balance');
    const pc = this.requirePublicClient();
    const addr = (address ?? this.address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
    const ethBalance = await pc.getBalance({ address: addr });
    return {
      usdc: '0.00',
      eth: formatEther(ethBalance),
      address: addr,
    };
  }

  /** Export wallet for portability */
  async export(): Promise<ExportData> {
    this.telemetry.track('wallet.export');
    throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Export not supported for external signers.');
  }
}
