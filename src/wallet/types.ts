/**
 * Interface for wallet adapters.
 * Implement this interface to add support for different wallet providers.
 */
export interface WalletAdapter {
  /** Get the wallet address */
  getAddress(): Promise<string>;

  /** Sign a message */
  signMessage(message: string): Promise<string>;

  /** Sign typed data (EIP-712) */
  signTypedData(data: TypedData): Promise<string>;

  /** Send a transaction */
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
}

/**
 * EIP-712 typed data structure.
 */
export interface TypedData {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Transaction request structure.
 */
export interface TransactionRequest {
  /** Recipient address */
  to: string;
  /** Transaction value in wei */
  value?: bigint;
  /** Transaction data */
  data?: string;
  /** Gas limit */
  gasLimit?: bigint;
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: bigint;
  /** Nonce */
  nonce?: number;
}

/**
 * Transaction response structure.
 */
export interface TransactionResponse {
  /** Transaction hash */
  hash: string;

  /** Wait for transaction confirmation */
  wait(confirmations?: number): Promise<TransactionReceipt>;
}

/**
 * Transaction receipt structure.
 */
export interface TransactionReceipt {
  /** Transaction hash */
  transactionHash: string;
  /** Block number */
  blockNumber: number;
  /** Block hash */
  blockHash: string;
  /** Transaction status (1 = success, 0 = failure) */
  status: number;
  /** Gas used */
  gasUsed: bigint;
}
