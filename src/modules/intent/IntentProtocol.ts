import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type {
  IntentRequestOptions,
  IntentResult,
  PreparedIntent,
  IntentStatus,
  ApprovalResult,
  TxReceipt,
  IntentHistoryFilters,
} from './types.js';

/**
 * The Intent Protocol is the heart of Invariance.
 *
 * Every verified action follows the same four-step handshake:
 * **Request -> Approve -> Execute -> Verify**.
 *
 * The proof generated at the end looks identical regardless of who
 * performed the action (agent, human, or device).
 *
 * @example
 * ```typescript
 * const trade = await inv.intent.request({
 *   actor: { type: 'agent', address: '0xTradingBot' },
 *   action: 'swap',
 *   params: { from: 'USDC', to: 'ETH', amount: '100' },
 *   approval: 'auto',
 * });
 * console.log(trade.explorerUrl);
 * ```
 */
export class IntentProtocol {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /**
   * Full intent handshake: request, approve, execute, verify.
   *
   * This is the primary method for performing verified actions.
   * The approval method determines how the intent is approved:
   * - 'auto': Policy engine auto-approves (for agents)
   * - 'wallet-signature': Requires wallet signature (for humans)
   * - 'multi-sig': M-of-N approval required
   *
   * @param opts - Intent request options
   * @returns The completed intent result with proof bundle
   */
  async request(opts: IntentRequestOptions): Promise<IntentResult> {
    this.telemetry.track('intent.request', {
      action: opts.action,
      approval: opts.approval ?? 'auto',
    });

    this.events.emit('intent.requested', {
      intentId: 'pending',
      action: opts.action,
    });

    // TODO: Full intent lifecycle implementation
    // 1. Register intent on InvarianceIntent contract
    // 2. Evaluate against policies (if policyId provided)
    // 3. Handle approval method (auto, wallet-signature, multi-sig)
    // 4. Execute the action on target contract
    // 5. Log to ledger with dual signatures
    // 6. Generate ProofBundle
    // 7. Return IntentResult with explorerUrl
    throw new InvarianceError(
      ErrorCode.INTENT_REJECTED,
      'Intent execution not yet implemented. Contract integration required.',
    );
  }

  /**
   * Prepare an intent without executing (dry-run).
   *
   * Useful for checking if an intent would succeed, estimating gas,
   * and previewing policy evaluations before committing.
   *
   * @param opts - Intent request options
   * @returns Prepared intent with policy checks and gas estimate
   */
  async prepare(opts: IntentRequestOptions): Promise<PreparedIntent> {
    this.telemetry.track('intent.prepare', { action: opts.action });

    // TODO: Simulate intent without executing
    // 1. Evaluate policies locally
    // 2. Estimate gas via eth_estimateGas
    // 3. Check state gates
    // 4. Return PreparedIntent with warnings
    const intentId = `inv_int_${Date.now().toString(36)}`;

    return {
      intentId,
      wouldSucceed: false,
      policyChecks: [],
      estimatedGas: {
        ethCost: '0.00',
        usdcCost: '0.00',
        gasLimit: 0,
        gasPrice: '0',
        strategy: this.contracts.getGasStrategy(),
      },
      warnings: ['Intent preparation is a stub. Contract integration required.'],
    };
  }

  /**
   * Manually approve a pending intent.
   *
   * Used when an intent requires wallet signature or multi-sig approval
   * and the signer wants to approve it explicitly.
   *
   * @param intentId - The intent to approve
   * @returns Approval result with threshold status
   */
  async approve(intentId: string): Promise<ApprovalResult> {
    this.telemetry.track('intent.approve');

    // TODO: Sign and submit approval to InvarianceIntent contract
    throw new InvarianceError(
      ErrorCode.APPROVAL_TIMEOUT,
      `Cannot approve intent: ${intentId}. Contract integration required.`,
    );
  }

  /**
   * Reject a pending intent.
   *
   * @param intentId - The intent to reject
   * @param reason - Optional reason for rejection
   * @returns Transaction receipt
   */
  async reject(intentId: string, reason?: string): Promise<TxReceipt> {
    this.telemetry.track('intent.reject');

    this.events.emit('intent.rejected', {
      intentId,
      reason: reason ?? 'Manually rejected',
    });

    // TODO: Call intent.reject(intentId, reasonHash) on-chain
    throw new InvarianceError(
      ErrorCode.INTENT_REJECTED,
      `Cannot reject intent: ${intentId}. Contract integration required.`,
    );
  }

  /**
   * Check the lifecycle status of an intent.
   *
   * @param intentId - The intent to check
   * @returns Current intent status with approval details
   */
  async status(intentId: string): Promise<IntentStatus> {
    this.telemetry.track('intent.status');

    // TODO: Query InvarianceIntent contract or indexer for status
    throw new InvarianceError(
      ErrorCode.INTENT_EXPIRED,
      `Intent not found: ${intentId}`,
    );
  }

  /**
   * Query intent history with filters.
   *
   * @param filters - Optional filters for actor, action, status, time range
   * @returns Array of completed intent results
   */
  async history(filters?: IntentHistoryFilters): Promise<IntentResult[]> {
    this.telemetry.track('intent.history', { hasFilters: filters !== undefined });

    // TODO: Query indexer API with filters
    return [];
  }
}
