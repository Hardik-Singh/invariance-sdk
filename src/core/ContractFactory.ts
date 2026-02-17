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
import { type PublicClient, type WalletClient, createPublicClient, getContract as viemGetContract, http, webSocket } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  InvarianceIdentityAbi,
  InvariancePolicyAbi,
  InvarianceLedgerAbi,
  InvarianceIntentAbi,
  InvarianceEscrowAbi,
  InvarianceReviewAbi,
  InvarianceRegistryAbi,
  InvarianceHireAbi,
  MockUSDCAbi,
  InvarianceCompactLedgerAbi,
  InvarianceAtomicVerifierAbi,
  InvarianceVotingAbi,
} from '../contracts/abis/index.js';

type ContractName = 'identity' | 'policy' | 'ledger' | 'intent' | 'escrow' | 'review' | 'registry' | 'hire' | 'mockUsdc' | 'compactLedger' | 'atomicVerifier' | 'voting';

const ABI_MAP = {
  identity: InvarianceIdentityAbi,
  policy: InvariancePolicyAbi,
  ledger: InvarianceLedgerAbi,
  intent: InvarianceIntentAbi,
  escrow: InvarianceEscrowAbi,
  review: InvarianceReviewAbi,
  registry: InvarianceRegistryAbi,
  hire: InvarianceHireAbi,
  mockUsdc: MockUSDCAbi,
  compactLedger: InvarianceCompactLedgerAbi,
  atomicVerifier: InvarianceAtomicVerifierAbi,
  voting: InvarianceVotingAbi,
} as const;

const ADDRESS_KEY_MAP: Record<ContractName, keyof ContractAddresses> = {
  identity: 'identity',
  policy: 'policy',
  ledger: 'ledger',
  intent: 'intent',
  escrow: 'escrow',
  review: 'review',
  registry: 'registry',
  hire: 'hire',
  mockUsdc: 'usdc',
  compactLedger: 'compactLedger',
  atomicVerifier: 'atomicVerifier',
  voting: 'voting',
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
  private wsPublicClient: PublicClient | null = null;
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

    const chain = config.chain === 'base' ? base : baseSepolia;
    const rpcUrl = config.rpcUrl ?? this.chainConfig.rpcUrl;
    const pollingInterval = config.pollingInterval ?? this.chainConfig.pollingInterval;
    this.publicClient = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval }) as PublicClient;

    // Warn if using mainnet without API key (unsigned attestations)
    if (config.chain === 'base' && !config.apiKey) {
      console.warn('[Invariance] No API key configured. Platform attestations will use unsigned commitments. Set apiKey for production use.');
    }

    // Create WebSocket-backed client for faster receipt watching (instant block notifications)
    if (config.wsRpcUrl) {
      try {
        this.wsPublicClient = createPublicClient({ chain, transport: webSocket(config.wsRpcUrl), pollingInterval }) as PublicClient;
      } catch {
        // Fall back to HTTP if WS connection fails
      }
    }
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
  getGasStrategy(): 'standard' | 'fast' | 'abstracted' | 'sponsored' {
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

  /**
   * Get the best available client for receipt watching.
   * Prefers WebSocket (instant block notifications) over HTTP polling.
   */
  getReceiptClient(): PublicClient {
    return this.wsPublicClient ?? this.getPublicClient();
  }

  /** Get the confirmation strategy. */
  getConfirmation(): 'optimistic' | 'receipt' {
    return this.config.confirmation ?? 'receipt';
  }

  /** Get the public client for read operations */
  getPublicClient(): PublicClient {
    if (!this.publicClient) {
      throw new InvarianceError(
        ErrorCode.WALLET_NOT_CONNECTED,
        'Public client not initialized. Provide rpcUrl or signer in config.',
      );
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
    if (!this.publicClient) {
      throw new InvarianceError(
        ErrorCode.WALLET_NOT_CONNECTED,
        'Public client not initialized. Provide rpcUrl or signer in config.',
      );
    }
    const abi = ABI_MAP[name];
    const addressKey = ADDRESS_KEY_MAP[name];
    const address = this.addresses[addressKey] as `0x${string}`;

    // The actual viem contract instance has fully typed read/write methods
    // but we use a simplified return type to avoid TS serialization limits
    const contract = viemGetContract({
      address,
      abi,
      client: this.walletClient ? { public: this.publicClient, wallet: this.walletClient } : { public: this.publicClient },
    }) as unknown as {
      address: `0x${string}`;
      abi: readonly unknown[];
      read: Record<string, (...args: unknown[]) => Promise<unknown>>;
      write: Record<string, (...args: unknown[]) => Promise<`0x${string}`>>;
    };

    if (this.walletClient) {
      return contract;
    }

    const writeProxy = new Proxy(
      {},
      {
        get() {
          throw new InvarianceError(
            ErrorCode.WALLET_NOT_CONNECTED,
            'Wallet client not initialized. Provide a signer to perform write operations.',
          );
        },
      },
    ) as Record<string, (...args: unknown[]) => Promise<`0x${string}`>>;

    return {
      ...contract,
      write: writeProxy,
    };
  }

  /** Get the API base URL for indexer calls */
  getApiBaseUrl(): string {
    const url = this.config.apiBaseUrl
      ?? (typeof process !== 'undefined' ? process.env['INVARIANCE_API_URL'] : undefined)
      ?? (this.config.chain === 'base'
        ? 'https://api.useinvariance.com'
        : 'https://api-sepolia.useinvariance.com');

    // Enforce HTTPS except for localhost development
    if (!url.startsWith('https://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `API base URL must use HTTPS: ${url}. Use http:// only for localhost development.`,
      );
    }
    return url;
  }

  /** Get the wallet address from the wallet client */
  getWalletAddress(): string {
    const walletClient = this.getWalletClient();
    if (!walletClient.account) {
      throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'No account found in wallet client');
    }
    return walletClient.account.address;
  }

  /**
   * Get the EIP-712 domain for CompactLedger signatures.
   *
   * @returns EIP-712 domain with the CompactLedger contract address
   */
  getCompactLedgerDomain(): { name: string; version: string; chainId: number; verifyingContract: `0x${string}` } {
    const address = this.addresses.compactLedger;
    if (!address) {
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        'CompactLedger contract address not configured for this chain.',
      );
    }
    return {
      name: 'InvarianceCompactLedger',
      version: '1',
      chainId: this.chainConfig.id,
      verifyingContract: address as `0x${string}`,
    };
  }
}
