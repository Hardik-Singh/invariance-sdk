import {
  createWalletClient,
  createPublicClient,
  http,
  custom,
  formatEther,
  parseEther,
  type WalletClient,
  type PublicClient,
  type Account,
  type Chain,
} from 'viem';
import type { ContractFactory } from '../../core/ContractFactory.js';
import type { Telemetry } from '../../core/Telemetry.js';
import type { EIP1193Provider, InvarianceSigner, InvarianceConfig } from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type { WalletInfo, BalanceInfo, WalletProvider, FundOptions, CreateWalletOptions } from './types.js';
import type { TxReceipt, ExportData } from '@invariance/common';
import { waitForReceipt } from '../../utils/contract-helpers.js';

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
  private readonly config: InvarianceConfig;
  private walletClient: WalletClient | null = null;
  private publicClient: PublicClient | null = null;
  private address: `0x${string}` | null = null;
  private detectedProvider: WalletProvider = 'raw';

  constructor(
    contracts: ContractFactory,
    telemetry: Telemetry,
    config: InvarianceConfig,
  ) {
    this.contracts = contracts;
    this.telemetry = telemetry;
    this.config = config;
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
    } else if (this.isPrivyWallet(signer)) {
      // Check for Privy BEFORE generic EIP-1193 provider
      this.detectedProvider = 'privy';
      const provider = signer as EIP1193Provider;
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const firstAccount = accounts[0];
      if (!firstAccount) {
        throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'No accounts from Privy');
      }
      this.address = firstAccount as `0x${string}`;
      this.walletClient = createWalletClient({
        account: this.address,
        chain,
        transport: custom(provider),
      });
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

  private isPrivyWallet(signer: unknown): boolean {
    if (typeof signer !== 'object' || signer === null) return false;
    const obj = signer as Record<string, unknown>;

    // Check for Privy-specific markers
    // Common patterns: provider._privy, provider.isPrivy, provider.privy
    return (
      '_privy' in obj ||
      'isPrivy' in obj ||
      ('privy' in obj && obj['privy'] !== undefined) ||
      (obj.constructor?.name === 'PrivyProvider')
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

  /**
   * Convert decimal USDC amount to USDC wei (6 decimals).
   * @param amount - Decimal amount string (e.g., "100.50")
   * @returns The amount in USDC wei (6 decimals)
   */
  private toUSDCWei(amount: string): bigint {
    const parts = amount.split('.');
    const whole = parts[0] ?? '0';
    const fraction = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
    return BigInt(whole + fraction);
  }

  /**
   * Convert USDC wei (6 decimals) to decimal string.
   * @param wei - The amount in USDC wei (6 decimals)
   * @returns The amount in decimal format
   */
  private fromUSDCWei(wei: bigint): string {
    const str = wei.toString().padStart(7, '0'); // 6 decimals + at least 1 whole digit
    const whole = str.slice(0, -6);
    const fraction = str.slice(-6);
    return `${whole}.${fraction}`;
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
   * Create an embedded wallet using Privy.
   * Requires Privy configuration in InvarianceConfig: { privy: { appId, appSecret } }
   * @param _opts - Optional wallet creation options
   */
  async create(_opts?: CreateWalletOptions): Promise<WalletInfo> {
    this.telemetry.track('wallet.create');

    // Check if Privy is configured
    const privyConfig = this.config.privy;
    if (!privyConfig) {
      throw new InvarianceError(
        ErrorCode.WALLET_NOT_CONNECTED,
        'Embedded wallet creation requires Privy config: { privy: { appId, appSecret } }',
      );
    }

    // Lazy-import Privy SDK (optional dependency)
    let PrivyClient: any;
    try {
      // @ts-expect-error - Optional peer dependency, may not be installed
      const privyModule = await import('@privy-io/server-auth');
      PrivyClient = (privyModule as any).PrivyClient;
    } catch {
      throw new InvarianceError(
        ErrorCode.WALLET_NOT_CONNECTED,
        'Install @privy-io/server-auth: pnpm add @privy-io/server-auth',
      );
    }

    // Create Privy client and embedded wallet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const privy = new PrivyClient(privyConfig.appId, privyConfig.appSecret);

    // Create a new user and embedded wallet using Privy's API
    // Note: This creates a wallet that's controlled by Privy
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const wallet = await privy.createWallet({
      // Privy will generate a new wallet address
    });

    return {
      address: wallet.address as string,
      provider: 'privy',
      chainId: this.contracts.getChainId(),
      connected: true,
      isSmartAccount: false,
    };
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
   * Send USDC or ETH to a wallet address.
   * WARNING: This method executes transfers immediately without confirmation prompts.
   * The caller is responsible for implementing any necessary security checks.
   * @param address - The recipient address
   * @param opts - Fund options including amount and token type (defaults to USDC)
   */
  async fund(address: string, opts: FundOptions): Promise<TxReceipt> {
    this.telemetry.track('wallet.fund', { token: opts.token ?? 'USDC' });
    this.requireWallet();

    const token = opts.token ?? 'USDC';
    const recipient = address as `0x${string}`;
    const publicClient = this.requirePublicClient();

    if (token === 'USDC') {
      // USDC transfer (ERC20)
      const usdcContract = this.contracts.getContract('mockUsdc');
      const amount = this.toUSDCWei(opts.amount);

      const transferFn = usdcContract.write['transfer'];
      if (!transferFn) {
        throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'USDC contract transfer not found');
      }

      const txHash = await transferFn([recipient, amount]);
      const receipt = await waitForReceipt(publicClient, txHash);

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } else {
      // ETH transfer (native)
      const value = parseEther(opts.amount);

      const txHash = await this.walletClient!.sendTransaction({
        account: this.walletClient!.account ?? this.address!,
        to: recipient,
        value,
        chain: this.walletClient!.chain,
      });
      const receipt = await waitForReceipt(publicClient, txHash);

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    }
  }

  /**
   * Get USDC and ETH balances for an address.
   * @param address - The address to check (defaults to current wallet)
   */
  async balance(address?: string | undefined): Promise<BalanceInfo> {
    this.telemetry.track('wallet.balance');
    const pc = this.requirePublicClient();
    const addr = (address ?? this.address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

    // Get ETH balance
    const ethBalance = await pc.getBalance({ address: addr });

    // Get USDC balance
    let usdcBalance = '0.000000';
    try {
      const usdcContract = this.contracts.getContract('mockUsdc');
      const balanceOfFn = usdcContract.read['balanceOf'];
      if (balanceOfFn) {
        const balance = await balanceOfFn([addr]) as bigint;
        usdcBalance = this.fromUSDCWei(balance);
      }
    } catch {
      // If USDC contract unavailable, default to 0
    }

    return {
      usdc: usdcBalance,
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
