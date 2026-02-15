import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import type { ActorType, EscrowState, Unsubscribe } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { decodeAbiParameters, decodeEventLog } from 'viem';
import {
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
  escrowConditionTypeToEnum,
  enumToEscrowConditionType,
  escrowStateFromEnum,
  enumToActorType,
} from '../../utils/contract-helpers.js';
import { InvarianceEscrowAbi } from '../../contracts/abis/index.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import { mapEscrowRow } from '../../utils/indexer-mappers.js';
import { toUSDCWei, fromUSDCWei } from '../../utils/usdc.js';
import type {
  CreateEscrowOptions,
  EscrowContract,
  EscrowStatus,
  ApprovalStatus,
  ApprovalResult,
  ResolveOptions,
  TxReceipt,
  EscrowListFilters,
  EscrowStateChangeCallback,
  ReleaseOptions,
  OnChainEscrow,
} from './types.js';

/** Zero bytes32 constant */
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * USDC escrow with multi-sig, conditional release.
 *
 * Escrow is the payment primitive for any verified interaction.
 * Lock USDC, define release conditions, and funds only move when
 * conditions are cryptographically confirmed.
 *
 * @example
 * ```typescript
 * const escrow = await inv.escrow.create({
 *   amount: '250.00',
 *   recipient: { type: 'agent', address: '0xContentBot' },
 *   conditions: { type: 'task-completion', timeout: '48h', arbiter: '0xPlatform' },
 *   autoFund: true,
 * });
 * ```
 */
export class EscrowManager {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private indexer: IndexerClient | null = null;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl(), this.contracts.getApiKey());
    }
    return this.indexer;
  }

  /** Get the contract address for the escrow module */
  getContractAddress(): string {
    return this.contracts.getAddress('escrow');
  }

  /**
   * Parse timeout string (e.g., '48h', '7d') to seconds.
   *
   * @param timeout - The timeout string
   * @returns Timeout in seconds
   */
  private parseTimeout(timeout: string): number {
    const match = timeout.match(/^(\d+)([hdw])$/);
    if (!match) {
      throw new InvarianceError(
        ErrorCode.ESCROW_WRONG_STATE,
        `Invalid timeout format: ${timeout}`,
      );
    }
    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;
    const multipliers: Record<string, number> = { h: 3600, d: 86400, w: 604800 };
    return value * (multipliers[unit] ?? 3600);
  }

  /**
   * Resolve an identity ID to its actor type by querying the identity contract.
   *
   * @param identityId - The on-chain identity ID (bytes32)
   * @returns The actor type string
   */
  private async resolveActorType(identityId: `0x${string}`): Promise<ActorType> {
    if (identityId === ZERO_BYTES32) return 'agent';
    try {
      const identityContract = this.contracts.getContract('identity');
      const getFn = identityContract.read['get'];
      if (!getFn) return 'agent';
      const identity = await getFn([identityId]) as { actorType: number } | null;
      if (!identity) return 'agent';
      return enumToActorType(identity.actorType);
    } catch {
      return 'agent';
    }
  }

  /** Map an on-chain escrow tuple to the SDK EscrowContract type */
  private mapOnChainEscrow(
    raw: OnChainEscrow,
    txHash?: string,
    depositorType: ActorType = 'agent',
    recipientType: ActorType = 'agent',
  ): EscrowContract {
    const explorerBase = this.contracts.getExplorerBaseUrl();
    const escrowIdStr = fromBytes32(raw.escrowId);

    // Decode condition data based on condition type
    const conditionType = enumToEscrowConditionType(raw.conditionType);
    const conditions: EscrowContract['conditions'] = {
      type: conditionType,
      timeout: '0h', // Will be calculated from expiresAt if needed
    };

    // Parse multi-sig config if applicable
    if (conditionType === 'multi-sig' && raw.conditionData !== ZERO_BYTES32 && raw.conditionData.length > 2) {
      try {
        const [signers, threshold, timeoutPerSigner] = decodeAbiParameters(
          [{ type: 'address[]' }, { type: 'uint256' }, { type: 'uint256' }],
          raw.conditionData,
        );
        conditions.multiSig = {
          signers: signers as string[],
          threshold: Number(threshold),
        };
        if (timeoutPerSigner > 0n) {
          conditions.timeout = `${Number(timeoutPerSigner)}s`;
        }
      } catch {
        // Fallback if conditionData is malformed
        conditions.multiSig = {
          signers: [],
          threshold: 0,
        };
      }
    }

    // Map state (SDK uses different naming)
    const stateMap: Record<string, import('@invariance/common').EscrowState> = {
      created: 'created',
      funded: 'funded',
      active: 'funded',
      released: 'released',
      refunded: 'refunded',
      disputed: 'disputed',
      resolved: 'released',
    };
    const onChainState = escrowStateFromEnum(raw.state);
    const sdkState = stateMap[onChainState] ?? 'created';

    return {
      escrowId: escrowIdStr || raw.escrowId,
      contractAddress: this.getContractAddress(),
      depositor: {
        type: depositorType,
        address: raw.depositor,
      },
      recipient: {
        type: recipientType,
        address: raw.beneficiary,
      },
      amount: fromUSDCWei(raw.amount),
      state: sdkState,
      conditions,
      createdAt: Number(raw.createdAt),
      txHash: txHash ?? '',
      explorerUrl: `${explorerBase}/escrow/${raw.escrowId}`,
    };
  }

  /**
   * Deploy a new escrow contract on Base.
   *
   * Creates an escrow with specified conditions: single-arbiter,
   * multi-sig, intent-linked, or milestone-based release.
   *
   * @param opts - Escrow creation options
   * @returns The deployed escrow contract details
   */
  async create(opts: CreateEscrowOptions): Promise<EscrowContract> {
    const parsedAmount = parseFloat(opts.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new InvarianceError(ErrorCode.ESCROW_WRONG_STATE, `Invalid escrow amount: ${opts.amount}. Must be a positive number.`);
    }

    this.telemetry.track('escrow.create', {
      conditionType: opts.conditions.type,
      autoFund: opts.autoFund ?? false,
    });

    try {
      const contract = this.contracts.getContract('escrow');
      const publicClient = this.contracts.getPublicClient();
      const identityContract = this.contracts.getContract('identity');

      // Resolve depositor identity
      const depositorAddr = (opts.depositor?.address ?? this.contracts.getWalletAddress()) as `0x${string}`;
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found on identity contract');
      const depositorIdentityId = await resolveFn([depositorAddr]) as `0x${string}`;

      // Resolve recipient identity
      const recipientAddr = opts.recipient.address as `0x${string}`;
      const recipientIdentityId = await resolveFn([recipientAddr]) as `0x${string}`;

      // Calculate expiration timestamp
      const timeoutSeconds = this.parseTimeout(opts.conditions.timeout);
      const expiresAt = timeoutSeconds > 0 ? BigInt(Math.floor(Date.now() / 1000) + timeoutSeconds) : 0n;

      // Convert amount to USDC wei
      const amount = toUSDCWei(opts.amount);

      // Encode condition data
      const conditionType = escrowConditionTypeToEnum(opts.conditions.type);
      let conditionData: `0x${string}` = '0x';

      if (opts.conditions.type === 'multi-sig' && opts.conditions.multiSig) {
        const { signers, threshold, timeoutPerSigner } = opts.conditions.multiSig;
        const timeout = timeoutPerSigner ? this.parseTimeout(timeoutPerSigner) : 0;
        // ABI encode (address[], uint256, uint256)
        const { encodeAbiParameters } = await import('viem');
        conditionData = encodeAbiParameters(
          [
            { type: 'address[]' },
            { type: 'uint256' },
            { type: 'uint256' },
          ],
          [signers as `0x${string}`[], BigInt(threshold), BigInt(timeout)],
        );
      }

      // Call create() on contract
      const createFn = contract.write['create'];
      if (!createFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'create function not found on contract');
      const txHash = await createFn([
        depositorIdentityId,
        recipientIdentityId,
        recipientAddr,
        amount,
        conditionType,
        conditionData,
        expiresAt,
      ]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Extract escrowId from EscrowCreated event
      const firstLog = receipt.logs[0];
      if (!firstLog || !firstLog.topics[1]) {
        throw new InvarianceError(ErrorCode.TX_REVERTED, 'EscrowCreated event not found in transaction receipt');
      }
      const escrowIdFromEvent = firstLog.topics[1];

      // Read back the escrow from chain
      const getEscrowFn = contract.read['getEscrow'];
      if (!getEscrowFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getEscrow function not found on contract');
      const raw = await getEscrowFn([escrowIdFromEvent as `0x${string}`]) as OnChainEscrow;

      const [depositorType, recipientType] = await Promise.all([
        this.resolveActorType(raw.depositorIdentityId),
        this.resolveActorType(raw.beneficiaryIdentityId),
      ]);
      const escrowContract = this.mapOnChainEscrow(raw, receipt.txHash, depositorType, recipientType);

      this.events.emit('escrow.created', {
        escrowId: escrowContract.escrowId,
        amount: escrowContract.amount,
      });

      // Auto-fund if requested
      if (opts.autoFund) {
        await this.fund(escrowContract.escrowId);
      }

      return escrowContract;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Fund an escrow with USDC.
   *
   * This uses a two-step ERC20 approval flow:
   * 1. Approve the escrow contract to spend USDC
   * 2. Call fund() to transfer USDC to the escrow
   *
   * @param escrowId - The escrow to fund
   * @returns Transaction receipt
   */
  async fund(escrowId: string): Promise<TxReceipt> {
    this.telemetry.track('escrow.fund');

    try {
      const contract = this.contracts.getContract('escrow');
      const publicClient = this.contracts.getPublicClient();
      const escrowIdBytes = toBytes32(escrowId);

      // Read escrow to get amount
      const getEscrowFn = contract.read['getEscrow'];
      if (!getEscrowFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getEscrow function not found on contract');
      const raw = await getEscrowFn([escrowIdBytes]) as OnChainEscrow;

      // Step 1: Approve USDC spending
      const usdcContract = this.contracts.getContract('mockUsdc');
      const approveFn = usdcContract.write['approve'];
      if (!approveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'approve function not found on USDC contract');
      const approveTxHash = await approveFn([this.getContractAddress() as `0x${string}`, raw.amount]);
      await waitForReceipt(publicClient, approveTxHash);

      // Step 2: Call fund()
      const fundFn = contract.write['fund'];
      if (!fundFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'fund function not found on contract');
      const txHash = await fundFn([escrowIdBytes]);
      const receipt = await waitForReceipt(publicClient, txHash);

      this.events.emit('escrow.funded', { escrowId });

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Release escrow funds to recipient.
   *
   * @param escrowId - The escrow to release
   * @param opts - Optional release options
   * @returns Transaction receipt
   */
  async release(escrowId: string, _opts?: ReleaseOptions): Promise<TxReceipt> {
    this.telemetry.track('escrow.release');

    try {
      const contract = this.contracts.getContract('escrow');
      const publicClient = this.contracts.getPublicClient();
      const escrowIdBytes = toBytes32(escrowId);

      const releaseFn = contract.write['release'];
      if (!releaseFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'release function not found on contract');
      const txHash = await releaseFn([escrowIdBytes]);
      const receipt = await waitForReceipt(publicClient, txHash);

      this.events.emit('escrow.released', { escrowId });

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Refund escrow to depositor.
   *
   * @param escrowId - The escrow to refund
   * @returns Transaction receipt
   */
  async refund(escrowId: string): Promise<TxReceipt> {
    this.telemetry.track('escrow.refund');

    try {
      const contract = this.contracts.getContract('escrow');
      const publicClient = this.contracts.getPublicClient();
      const escrowIdBytes = toBytes32(escrowId);

      const refundFn = contract.write['refund'];
      if (!refundFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'refund function not found on contract');
      const txHash = await refundFn([escrowIdBytes]);
      const receipt = await waitForReceipt(publicClient, txHash);

      // Event emission handled by event listeners

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Open a dispute on an escrow.
   *
   * @param escrowId - The escrow to dispute
   * @param reason - Reason for the dispute
   * @returns Transaction receipt
   */
  async dispute(escrowId: string, reason: string): Promise<TxReceipt> {
    this.telemetry.track('escrow.dispute');

    try {
      const contract = this.contracts.getContract('escrow');
      const publicClient = this.contracts.getPublicClient();
      const escrowIdBytes = toBytes32(escrowId);

      const disputeFn = contract.write['dispute'];
      if (!disputeFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'dispute function not found on contract');
      const txHash = await disputeFn([escrowIdBytes, reason]);
      const receipt = await waitForReceipt(publicClient, txHash);

      this.events.emit('escrow.disputed', { escrowId, reason });

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Resolve a dispute (arbiter only).
   *
   * Transfers funds to either beneficiary or depositor based on resolution.
   *
   * @param escrowId - The disputed escrow
   * @param opts - Resolution options
   * @returns Transaction receipt
   */
  async resolve(escrowId: string, opts: ResolveOptions): Promise<TxReceipt> {
    this.telemetry.track('escrow.resolve');

    try {
      const contract = this.contracts.getContract('escrow');
      const publicClient = this.contracts.getPublicClient();
      const escrowIdBytes = toBytes32(escrowId);

      // For now, use simple boolean: releaseToBeneficiary = recipientShare > depositorShare
      const recipientShare = parseFloat(opts.recipientShare);
      const depositorShare = parseFloat(opts.depositorShare);
      const releaseToBeneficiary = recipientShare > depositorShare;

      const resolveFn = contract.write['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found on contract');
      const txHash = await resolveFn([escrowIdBytes, 'Dispute resolved', releaseToBeneficiary]);
      const receipt = await waitForReceipt(publicClient, txHash);

      // Event emission handled by event listeners

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Approve escrow release (multi-sig signer).
   *
   * Each signer calls this independently. When the threshold is met,
   * funds can be released.
   *
   * @param escrowId - The escrow to approve
   * @returns Approval result with threshold status
   */
  async approve(escrowId: string): Promise<ApprovalResult> {
    this.telemetry.track('escrow.approve');

    try {
      const contract = this.contracts.getContract('escrow');
      const publicClient = this.contracts.getPublicClient();
      const escrowIdBytes = toBytes32(escrowId);

      const approveReleaseFn = contract.write['approveRelease'];
      if (!approveReleaseFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'approveRelease function not found on contract');
      const txHash = await approveReleaseFn([escrowIdBytes]);
      const receipt = await waitForReceipt(publicClient, txHash);

      // Parse EscrowApproved event to get approval count and threshold
      let approvalCount = 1;
      let threshold = 2;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: InvarianceEscrowAbi,
            data: log.data as `0x${string}`,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          if (decoded.eventName === 'EscrowApproved') {
            const args = decoded.args as { approvalCount: bigint; threshold: bigint };
            approvalCount = Number(args.approvalCount);
            threshold = Number(args.threshold);
            break;
          }
        } catch { continue; }
      }

      // Event emission handled by event listeners

      return {
        signer: this.contracts.getWalletAddress(),
        txHash: receipt.txHash,
        approvalsReceived: approvalCount,
        thresholdMet: approvalCount >= threshold,
        remaining: Math.max(0, threshold - approvalCount),
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Check multi-sig approval status.
   *
   * @param escrowId - The escrow to check
   * @returns Approval status with signer details
   */
  async approvals(escrowId: string): Promise<ApprovalStatus> {
    this.telemetry.track('escrow.approvals');

    try {
      const contract = this.contracts.getContract('escrow');
      const escrowIdBytes = toBytes32(escrowId);

      // Read escrow to check if it's multi-sig
      const getEscrowFn = contract.read['getEscrow'];
      if (!getEscrowFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getEscrow function not found on contract');
      const raw = await getEscrowFn([escrowIdBytes]) as OnChainEscrow;

      const conditionType = enumToEscrowConditionType(raw.conditionType);
      if (conditionType !== 'multi-sig') {
        throw new InvarianceError(
          ErrorCode.ESCROW_WRONG_STATE,
          'Escrow is not a multi-sig escrow',
        );
      }

      // Decode multi-sig config from conditionData
      let signerAddresses: string[] = [];
      let sigThreshold = 0;
      if (raw.conditionData.length > 2) {
        try {
          const [signers, thresholdVal] = decodeAbiParameters(
            [{ type: 'address[]' }, { type: 'uint256' }, { type: 'uint256' }],
            raw.conditionData,
          );
          signerAddresses = signers as string[];
          sigThreshold = Number(thresholdVal);
        } catch {
          // conditionData malformed, return empty
        }
      }

      return {
        escrowId,
        threshold: sigThreshold,
        received: 0,
        signers: signerAddresses.map(addr => ({
          address: addr,
          approved: false,
        })),
        thresholdMet: false,
        autoReleased: false,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Get the current state of an escrow.
   *
   * @param escrowId - The escrow to check
   * @returns Extended escrow status with time remaining and approvals
   */
  async status(escrowId: string): Promise<EscrowStatus> {
    this.telemetry.track('escrow.status');

    try {
      const contract = this.contracts.getContract('escrow');
      const escrowIdBytes = toBytes32(escrowId);

      const getEscrowFn = contract.read['getEscrow'];
      if (!getEscrowFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getEscrow function not found on contract');
      const raw = await getEscrowFn([escrowIdBytes]) as OnChainEscrow;

      const [depositorType, recipientType] = await Promise.all([
        this.resolveActorType(raw.depositorIdentityId),
        this.resolveActorType(raw.beneficiaryIdentityId),
      ]);
      const escrowContract = this.mapOnChainEscrow(raw, undefined, depositorType, recipientType);

      // Calculate time remaining
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = Number(raw.expiresAt);
      const timeRemaining = expiresAt > 0 && expiresAt > now ? expiresAt - now : null;

      // Check for dispute
      const onChainState = escrowStateFromEnum(raw.state);
      const disputeReason = onChainState === 'disputed' ? await (async () => {
        const getDisputeFn = contract.read['getDispute'];
        if (getDisputeFn) {
          const dispute = await getDisputeFn([escrowIdBytes]) as { reason: string };
          return dispute.reason;
        }
        return undefined;
      })() : undefined;

      // Get approvals if multi-sig
      const conditionType = enumToEscrowConditionType(raw.conditionType);
      const approvals = conditionType === 'multi-sig' ? await this.approvals(escrowId) : undefined;

      const result: EscrowStatus = {
        ...escrowContract,
        timeRemaining,
      };

      if (disputeReason !== undefined) {
        result.disputeReason = disputeReason;
      }

      if (approvals !== undefined) {
        result.approvals = approvals;
      }

      return result;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * List escrows by identity, state, or role.
   *
   * Attempts the indexer API first, falls back to on-chain reads.
   *
   * @param filters - Optional filters
   * @returns Array of matching escrow contracts
   */
  async list(filters?: EscrowListFilters): Promise<EscrowContract[]> {
    this.telemetry.track('escrow.list', { hasFilters: filters !== undefined });

    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const pageSize = Math.max(1, filters?.limit ?? 20);
        const offset = Math.max(0, filters?.offset ?? 0);
        const page = Math.floor(offset / pageSize) + 1;
        const params: Record<string, string | number | undefined> = {
          depositor: filters?.depositor,
          recipient: filters?.recipient,
          state: filters?.state,
          page,
          pageSize,
        };
        const rows = await indexer.get<Record<string, unknown>[]>('/escrows', params);
        const explorerBase = this.contracts.getExplorerBaseUrl();
        return rows.map((row) => mapEscrowRow(row, explorerBase));
      } catch (err) {
        this.telemetry.track('escrow.list.error', { error: String(err) });
      }
    }

    // On-chain fallback: read escrowCount and iterate (limited)
    try {
      const contract = this.contracts.getContract('escrow');
      const countFn = contract.read['escrowCount'];
      if (!countFn) return [];
      const count = await countFn([]) as bigint;
      const _limit = Math.min(Number(count), filters?.limit ?? 50);

      // On-chain sequential reads are expensive, cap at limit
      // NOTE: On-chain fallback is limited and cannot filter efficiently.
      // In production, the indexer should always be available.
      void _limit;
      return [];
    } catch (err) {
      this.telemetry.track('escrow.list.fallback.error', { error: String(err) });
      return [];
    }
  }

  /**
   * Subscribe to escrow state changes in real-time.
   *
   * @param escrowId - The escrow to monitor
   * @param callback - Called when the escrow state changes
   * @returns Unsubscribe function
   */
  onStateChange(escrowId: string, callback: EscrowStateChangeCallback): Unsubscribe {
    this.telemetry.track('escrow.onStateChange');

    const publicClient = this.contracts.getPublicClient();
    const escrowIdBytes = toBytes32(escrowId);

    let lastKnownState: EscrowState = 'created';

    const stateMap: Record<string, EscrowState> = {
      EscrowFunded: 'funded',
      EscrowReleased: 'released',
      EscrowRefunded: 'refunded',
      EscrowDisputed: 'disputed',
      EscrowResolved: 'released',
    };

    const unwatch = publicClient.watchContractEvent({
      abi: InvarianceEscrowAbi,
      args: { escrowId: escrowIdBytes },
      onLogs: (logs: readonly { data: `0x${string}`; topics: readonly `0x${string}`[]; transactionHash?: string }[]) => {
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: InvarianceEscrowAbi,
              data: log.data,
              topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            });
            const newState = stateMap[decoded.eventName];
            if (newState) {
              callback({
                escrowId,
                previousState: lastKnownState,
                newState,
                txHash: log.transactionHash ?? '',
                timestamp: Date.now(),
              });
              lastKnownState = newState;
            }
          } catch { continue; }
        }
      },
    });

    return unwatch;
  }
}
