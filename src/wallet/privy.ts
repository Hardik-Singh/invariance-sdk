import type {
  WalletAdapter,
  TypedData,
  TransactionRequest,
  TransactionResponse,
} from './types.js';

/**
 * Privy wallet configuration.
 */
export interface PrivyWalletConfig {
  /** Privy App ID */
  appId: string;
  /** Privy API secret (server-side only) */
  apiSecret: string;
}

/**
 * Privy wallet adapter for embedded wallets.
 *
 * @example
 * ```typescript
 * const wallet = new PrivyWallet({
 *   appId: process.env.PRIVY_APP_ID,
 *   apiSecret: process.env.PRIVY_API_SECRET,
 * });
 *
 * const inv = new Invariance({
 *   chainId: 8453,
 *   rpcUrl: process.env.RPC_URL,
 *   wallet,
 * });
 * ```
 */
export class PrivyWallet implements WalletAdapter {
  /** @internal */
  readonly _config: PrivyWalletConfig;
  private address: string | null = null;

  constructor(config: PrivyWalletConfig) {
    this._config = config;
  }

  /**
   * Get the wallet address.
   */
  async getAddress(): Promise<string> {
    if (this.address) {
      return this.address;
    }

    // TODO(high): @agent Implement Privy wallet address retrieval
    // Context: Need to initialize Privy SDK and get embedded wallet address
    // AC: Return the agent's embedded wallet address
    throw new Error('Not implemented');
  }

  /**
   * Sign a message with the wallet.
   */
  async signMessage(_message: string): Promise<string> {
    // TODO(high): @agent Implement Privy message signing
    // Context: Use Privy server SDK to sign message with embedded wallet
    // AC: Return the signature
    throw new Error('Not implemented');
  }

  /**
   * Sign typed data (EIP-712) with the wallet.
   */
  async signTypedData(_data: TypedData): Promise<string> {
    // TODO(high): @agent Implement Privy typed data signing
    // Context: Use Privy server SDK to sign EIP-712 data
    // AC: Return the signature
    throw new Error('Not implemented');
  }

  /**
   * Send a transaction from the wallet.
   */
  async sendTransaction(_tx: TransactionRequest): Promise<TransactionResponse> {
    // TODO(high): @agent Implement Privy transaction sending
    // Context: Use Privy server SDK to send transaction
    // AC: Return transaction response with wait() method
    throw new Error('Not implemented');
  }
}
