import type { ContractAddresses } from '@invariance/common';

/**
 * Escrow state for a task.
 */
export interface EscrowState {
  /** Task ID */
  taskId: string;
  /** Amount deposited (in wei) */
  amount: bigint;
  /** Depositor address */
  depositor: string;
  /** Recipient address (agent) */
  recipient: string;
  /** Deposit timestamp */
  depositTime: number;
  /** Whether the escrow is active */
  active: boolean;
}

/**
 * Interface for EscrowVault contract.
 */
export interface EscrowVaultContract {
  /** Deposit funds into escrow for a task */
  deposit(taskId: string, amount: bigint): Promise<{ txHash: string }>;

  /** Release funds to the recipient */
  release(taskId: string): Promise<{ txHash: string }>;

  /** Refund funds to the depositor (dispute won) */
  refund(taskId: string): Promise<{ txHash: string }>;

  /** Get escrow state for a task */
  getEscrow(taskId: string): Promise<EscrowState | null>;

  /** Open a dispute on an escrow */
  dispute(taskId: string, evidenceHash: string): Promise<{ txHash: string }>;
}

/**
 * Wrapper for the EscrowVault contract.
 */
export class EscrowVault implements EscrowVaultContract {
  private readonly contractAddress: string;
  private readonly rpcUrl: string;

  constructor(addresses: ContractAddresses, rpcUrl: string) {
    this.contractAddress = addresses.escrowVault;
    this.rpcUrl = rpcUrl;
  }

  /**
   * Deposit funds into escrow for a task.
   */
  async deposit(_taskId: string, _amount: bigint): Promise<{ txHash: string }> {
    // TODO(high): @agent Implement escrow deposit
    // Context: Call EscrowVault.deposit(taskId, amount) with value
    // AC: Return transaction hash after successful deposit
    throw new Error('Not implemented');
  }

  /**
   * Release funds to the recipient (task completed successfully).
   */
  async release(_taskId: string): Promise<{ txHash: string }> {
    // TODO(high): @agent Implement escrow release
    // Context: Call EscrowVault.release(taskId)
    // AC: Return transaction hash after successful release
    throw new Error('Not implemented');
  }

  /**
   * Refund funds to the depositor (dispute won by depositor).
   */
  async refund(_taskId: string): Promise<{ txHash: string }> {
    // TODO(high): @agent Implement escrow refund
    // Context: Call EscrowVault.refund(taskId)
    // AC: Return transaction hash after successful refund
    throw new Error('Not implemented');
  }

  /**
   * Get the escrow state for a task.
   */
  async getEscrow(_taskId: string): Promise<EscrowState | null> {
    // TODO(medium): @agent Implement escrow state retrieval
    // Context: Call EscrowVault.escrows(taskId) view function
    // AC: Return escrow state or null if not found
    throw new Error('Not implemented');
  }

  /**
   * Open a dispute on an escrow.
   */
  async dispute(_taskId: string, _evidenceHash: string): Promise<{ txHash: string }> {
    // TODO(high): @agent Implement dispute opening
    // Context: Call EscrowVault.dispute(taskId, evidenceHash)
    // AC: Return transaction hash after successful dispute opening
    throw new Error('Not implemented');
  }
}
