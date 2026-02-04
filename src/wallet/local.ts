import type {
  WalletAdapter,
  TypedData,
  TransactionRequest,
  TransactionResponse,
} from './types.js';

/**
 * Local wallet configuration.
 */
export interface LocalWalletConfig {
  /** Private key (hex string with or without 0x prefix) */
  privateKey: string;
  /** RPC URL for the blockchain */
  rpcUrl: string;
}

/**
 * Local wallet adapter for testing and development.
 * Uses a local private key for signing.
 *
 * WARNING: Do not use in production with real funds.
 *
 * @example
 * ```typescript
 * const wallet = new LocalWallet({
 *   privateKey: process.env.TEST_PRIVATE_KEY,
 *   rpcUrl: 'https://sepolia.base.org',
 * });
 *
 * const inv = new Invariance({
 *   chainId: 84532, // Base Sepolia
 *   rpcUrl: 'https://sepolia.base.org',
 *   wallet,
 * });
 * ```
 */
export class LocalWallet implements WalletAdapter {
  /** @internal */
  readonly config: LocalWalletConfig;

  constructor(config: LocalWalletConfig) {
    // Validate private key format
    const key = config.privateKey.startsWith('0x')
      ? config.privateKey
      : `0x${config.privateKey}`;

    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error('Invalid private key format');
    }

    this.config = {
      ...config,
      privateKey: key,
    };
  }

  /**
   * Get the wallet address derived from the private key.
   */
  async getAddress(): Promise<string> {
    // TODO(medium): @agent Implement address derivation from private key
    // Context: Use viem to derive address from private key
    // AC: Return the address as a checksummed hex string
    throw new Error('Not implemented');
  }

  /**
   * Sign a message with the private key.
   */
  async signMessage(_message: string): Promise<string> {
    // TODO(medium): @agent Implement local message signing
    // Context: Use viem to sign message with private key
    // AC: Return the signature
    throw new Error('Not implemented');
  }

  /**
   * Sign typed data (EIP-712) with the private key.
   */
  async signTypedData(_data: TypedData): Promise<string> {
    // TODO(medium): @agent Implement local typed data signing
    // Context: Use viem to sign EIP-712 data with private key
    // AC: Return the signature
    throw new Error('Not implemented');
  }

  /**
   * Send a transaction from the wallet.
   */
  async sendTransaction(_tx: TransactionRequest): Promise<TransactionResponse> {
    // TODO(medium): @agent Implement local transaction sending
    // Context: Use viem to send transaction from private key
    // AC: Return transaction response with wait() method
    throw new Error('Not implemented');
  }
}
