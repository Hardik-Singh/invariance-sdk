import type {
  InvarianceConfig,
  ContractAddresses,
  ChainConfig,
} from '@invariance/common';
import {
  getChainConfig,
  getContractAddresses,
} from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../errors/InvarianceError.js';
import { type PublicClient, type WalletClient, getContract as viemGetContract } from 'viem';
import {
  InvarianceIdentityAbi,
  InvariancePolicyAbi,
  InvarianceLedgerAbi,
  InvarianceIntentAbi,
  InvarianceEscrowAbi,
  InvarianceReviewAbi,
  InvarianceRegistryAbi,
  MockUSDCAbi,
} from '../contracts/abis/index.js';

type ContractName = 'identity' | 'policy' | 'ledger' | 'intent' | 'escrow' | 'review' | 'registry' | 'mockUsdc';

const ABI_MAP = {
  identity: InvarianceIdentityAbi,
  policy: InvariancePolicyAbi,
  ledger: InvarianceLedgerAbi,
  intent: InvarianceIntentAbi,
  escrow: InvarianceEscrowAbi,
  review: InvarianceReviewAbi,
  registry: InvarianceRegistryAbi,
  mockUsdc: MockUSDCAbi,
} as const;

const ADDRESS_KEY_MAP: Record<ContractName, keyof ContractAddresses> = {
  identity: 'identity',
  policy: 'policy',
  ledger: 'ledger',
  intent: 'intent',
  escrow: 'escrow',
  review: 'review',
  registry: 'registry',
  mockUsdc: 'usdc',
};

/**
 * Manages contract instances and blockchain connectivity.
 *
 * ContractFactory is the central point for creating and caching
 * viem PublicClient and WalletClient instances, as well as providing
 * typed contract addresses for each Invariance module.
 *
 * @example
 * ```typescript
 * const factory = new ContractFactory(config);
 * const identityAddr = factory.getAddress('identity');
 * ```
 */
export class ContractFactory {
  private readonly config: InvarianceConfig;
  private readonly chainConfig: ChainConfig;
  private readonly addresses: ContractAddresses;
  private publicClient: PublicClient | null = null;
  private walletClient: WalletClient | null = null;

  constructor(config: InvarianceConfig) {
    this.config = config;

    const chainId = config.chain === 'base' ? 8453 : 84532;

    const chainConfig = getChainConfig(chainId);
    if (!chainConfig) {
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        `Unsupported chain: ${config.chain}`,
      );
    }
    this.chainConfig = chainConfig;

    const addresses = getContractAddresses(chainId);
    if (!addresses) {
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        `No contracts deployed on chain: ${config.chain}`,
      );
    }
    this.addresses = addresses;
  }

  /**
   * Get the RPC URL for the current chain.
   * Uses config override if provided, otherwise falls back to chain default.
   */
  getRpcUrl(): string {
    return this.config.rpcUrl ?? this.chainConfig.rpcUrl;
  }

  /**
   * Get the chain configuration.
   */
  getChainConfig(): ChainConfig {
    return this.chainConfig;
  }

  /**
   * Get the chain ID.
   */
  getChainId(): number {
    return this.chainConfig.id;
  }

  /**
   * Get all contract addresses for the current chain.
   */
  getAddresses(): ContractAddresses {
    return this.addresses;
  }

  /**
   * Get a specific contract address by module name.
   *
   * @param name - The contract module name
   * @returns The contract address as a hex string
   */
  getAddress(name: keyof ContractAddresses): string {
    const addr = this.addresses[name];
    if (!addr) {
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        `Contract address not configured: ${name}`,
      );
    }
    return addr;
  }

  /**
   * Get the signer/wallet from config.
   * Returns undefined if no signer is configured.
   */
  getSigner(): unknown {
    return this.config.signer;
  }

  /**
   * Get the API key from config (for managed hosting).
   */
  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  /**
   * Get the gas strategy.
   */
  getGasStrategy(): 'standard' | 'fast' | 'abstracted' {
    return this.config.gasStrategy ?? 'standard';
  }

  /**
   * Get the explorer base URL.
   */
  getExplorerBaseUrl(): string {
    return this.config.explorerBaseUrl ?? 'https://verify.useinvariance.com';
  }

  /**
   * Check whether managed mode is active (API key provided).
   */
  isManaged(): boolean {
    return this.config.apiKey !== undefined;
  }

  /** Set the viem clients after wallet initialization */
  setClients(publicClient: PublicClient, walletClient: WalletClient): void {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
  }

  /** Get the public client for read operations */
  getPublicClient(): PublicClient {
    if (!this.publicClient) {
      throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Public client not initialized. Provide a signer in config.');
    }
    return this.publicClient;
  }

  /** Get the wallet client for write operations */
  getWalletClient(): WalletClient {
    if (!this.walletClient) {
      throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Wallet client not initialized. Provide a signer in config.');
    }
    return this.walletClient;
  }

  /** Check if clients are initialized */
  hasClients(): boolean {
    return this.publicClient !== null && this.walletClient !== null;
  }

  /**
   * Get a viem contract instance for the given contract name.
   *
   * @param name - The contract name
   * @returns A viem contract instance with read/write methods
   */
  getContract(name: ContractName): {
    address: `0x${string}`;
    abi: readonly unknown[];
    read: Record<string, (...args: unknown[]) => Promise<unknown>>;
    write: Record<string, (...args: unknown[]) => Promise<`0x${string}`>>;
  } {
    if (!this.publicClient || !this.walletClient) {
      throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Clients not initialized. Call setClients() first.');
    }
    const abi = ABI_MAP[name];
    const addressKey = ADDRESS_KEY_MAP[name];
    const address = this.addresses[addressKey] as `0x${string}`;

    // The actual viem contract instance has fully typed read/write methods
    // but we use a simplified return type to avoid TS serialization limits
    return viemGetContract({
      address,
      abi,
      client: { public: this.publicClient, wallet: this.walletClient },
    }) as unknown as {
      address: `0x${string}`;
      abi: readonly unknown[];
      read: Record<string, (...args: unknown[]) => Promise<unknown>>;
      write: Record<string, (...args: unknown[]) => Promise<`0x${string}`>>;
    };
  }

  /** Get the API base URL for indexer calls */
  getApiBaseUrl(): string {
    return this.config.chain === 'base'
      ? 'https://api.useinvariance.com'
      : 'https://api-sepolia.useinvariance.com';
  }

  /** Get the wallet address from the wallet client */
  getWalletAddress(): string {
    const walletClient = this.getWalletClient();
    if (!walletClient.account) {
      throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'No account found in wallet client');
    }
    return walletClient.account.address;
  }
}
