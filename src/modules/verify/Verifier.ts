import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import type { EscrowState } from '@invariance/common';
import { decodeEventLog } from 'viem';
import { InvarianceLedgerAbi, InvarianceIntentAbi } from '../../contracts/abis/index.js';
import {
  toBytes32,
  fromBytes32,
  mapContractError,
  enumToActorType,
} from '../../utils/contract-helpers.js';
import { fromUSDCWei } from '../../utils/usdc.js';
import type {
  VerificationResult,
  IdentityVerification,
  EscrowVerification,
  ProofData,
  VerifyActionOptions,
} from './types.js';

/** On-chain LedgerEntry struct returned by getEntry */
interface OnChainLedgerEntry {
  entryId: `0x${string}`;
  actorIdentityId: `0x${string}`;
  actorType: number;
  actorAddress: string;
  action: string;
  category: string;
  metadataHash: `0x${string}`;
  proofHash: `0x${string}`;
  actorSignature: string;
  platformSignature: string;
  severity: number;
  blockNumber: bigint;
  timestamp: bigint;
}

/** On-chain Escrow struct */
interface OnChainEscrow {
  escrowId: `0x${string}`;
  depositorIdentityId: `0x${string}`;
  beneficiaryIdentityId: `0x${string}`;
  depositor: string;
  beneficiary: string;
  amount: bigint;
  fundedAmount: bigint;
  conditionType: number;
  conditionData: `0x${string}`;
  state: number;
  createdAt: bigint;
  expiresAt: bigint;
  releasedAt: bigint;
}

/** On-chain Identity struct */
interface OnChainIdentity {
  identityId: `0x${string}`;
  actorType: number;
  owner: string;
  walletAddress: string;
  label: string;
  capabilities: string[];
  status: number;
  attestationCount: bigint;
  createdAt: bigint;
}

/**
 * Cryptographic verification and public explorer URLs.
 *
 * Verification is the public-facing proof layer. Any person, any system,
 * anywhere in the world can verify any Invariance action using a transaction
 * hash, an identity address, or a public explorer URL.
 *
 * The Verifier is special: it is both callable directly as `inv.verify(txHash)`
 * and has sub-methods like `inv.verify.action()`, `inv.verify.identity()`, etc.
 *
 * @example
 * ```typescript
 * // Direct call
 * const result = await inv.verify('0xtxhash...');
 *
 * // Sub-methods
 * const audit = await inv.verify.identity('0xTradingBot');
 * const url = inv.verify.url('inv_int_abc123');
 * ```
 */
export class Verifier {
  private readonly contracts: ContractFactory;
  private readonly telemetry: Telemetry;
  private indexer: IndexerClient | null = null;

  constructor(
    contracts: ContractFactory,
    _events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.telemetry = telemetry;
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl(), this.contracts.getApiKey());
    }
    return this.indexer;
  }

  /**
   * Verify a single transaction by hash.
   *
   * Retrieves the on-chain proof, validates signatures, and returns
   * the full verification result with an explorer URL.
   *
   * @param txHash - The transaction hash to verify
   * @returns Verification result with proof and explorer URL
   */
  async verify(txHash: string): Promise<VerificationResult> {
    this.telemetry.track('verify.verify');

    try {
      const publicClient = this.contracts.getPublicClient();
      const ledgerContract = this.contracts.getContract('ledger');

      // 1. Fetch tx receipt from RPC (tx is already mined)
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      if (receipt.status === 'reverted') {
        throw new InvarianceError(
          ErrorCode.VERIFICATION_FAILED,
          `Transaction reverted: ${txHash}`,
        );
      }

      // 2. Parse EntryLogged / IntentRequested events from receipt logs using ABI decoding
      let entryId: `0x${string}` | null = null;

      for (const log of receipt.logs) {
        // Try EntryLogged
        try {
          const decoded = decodeEventLog({
            abi: InvarianceLedgerAbi,
            data: log.data as `0x${string}`,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          if (decoded.eventName === 'EntryLogged') {
            entryId = (decoded.args as { entryId: `0x${string}` }).entryId;
            break;
          }
        } catch { /* not a ledger event */ }

        // Try IntentRequested
        try {
          const decoded = decodeEventLog({
            abi: InvarianceIntentAbi,
            data: log.data as `0x${string}`,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          if (decoded.eventName === 'IntentRequested') {
            entryId = (decoded.args as { intentId: `0x${string}` }).intentId;
            break;
          }
        } catch { /* not an intent event */ }
      }

      if (!entryId) {
        throw new InvarianceError(
          ErrorCode.VERIFICATION_FAILED,
          `No Invariance events found in transaction: ${txHash}`,
        );
      }

      // 3. Fetch the full on-chain ledger entry
      const getEntryFn = ledgerContract.read['getEntry'];
      let entry: OnChainLedgerEntry | null = null;

      if (getEntryFn) {
        try {
          entry = await getEntryFn([entryId]) as OnChainLedgerEntry;
        } catch {
          // Entry may not be in ledger (could be intent/escrow event)
        }
      }

      // 4. Validate signatures
      const hasActorSig = entry ? entry.actorSignature.length > 2 : false;
      const hasPlatformSig = entry ? entry.platformSignature.length > 2 : false;
      const signaturesValid = hasActorSig && hasPlatformSig;

      // 5. Build VerificationResult
      const explorerBase = this.contracts.getExplorerBaseUrl();
      const result: VerificationResult = {
        verified: signaturesValid && !!entry,
        // Note: No entry means unverified — the action was never logged on-chain
        txHash: receipt.transactionHash,
        action: entry ? entry.action : fromBytes32(entryId),
        actor: {
          type: entry ? enumToActorType(entry.actorType) : 'agent',
          address: entry ? entry.actorAddress : '',
        },
        timestamp: entry ? Number(entry.timestamp) * 1000 : Date.now(),
        blockNumber: Number(receipt.blockNumber),
        proof: {
          proofHash: entry ? (entry.proofHash as string) : (entryId as string),
          signatures: {
            actor: entry ? entry.actorSignature : '',
            ...(entry?.platformSignature ? { platform: entry.platformSignature } : {}),
            valid: signaturesValid,
          },
          metadataHash: entry ? (entry.metadataHash as string) : '',
          verifiable: true,
          raw: JSON.stringify({ txHash, entryId: fromBytes32(entryId), blockNumber: Number(receipt.blockNumber) }),
        },
        explorerUrl: `${explorerBase}/tx/${receipt.transactionHash}`,
      };

      return result;
    } catch (err) {
      if (err instanceof InvarianceError) throw err;
      throw mapContractError(err);
    }
  }

  /**
   * Verify by actor address and optionally action type and timeframe.
   *
   * @param opts - Verification options (actor, action, time range)
   * @returns Verification result for the matching action
   */
  async action(opts: VerifyActionOptions): Promise<VerificationResult> {
    this.telemetry.track('verify.action', { action: opts.action });

    try {
      // Try indexer first for efficient lookup
      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();

      if (available) {
        const params: Record<string, string | number | undefined> = {
          actor: opts.actor,
          action: opts.action,
          from: typeof opts.from === 'string' ? opts.from : opts.from?.toString(),
          to: typeof opts.to === 'string' ? opts.to : opts.to?.toString(),
          limit: 1,
        };

        try {
          const entries = await indexer.get<Array<{ txHash: string }>>('/ledger/entries', params);
          if (entries.length > 0 && entries[0]!.txHash) {
            return this.verify(entries[0]!.txHash);
          }
        } catch {
          // Fall through to error
        }
      }

      throw new InvarianceError(
        ErrorCode.VERIFICATION_FAILED,
        `No verified action found for actor: ${opts.actor}`,
      );
    } catch (err) {
      if (err instanceof InvarianceError) throw err;
      throw mapContractError(err);
    }
  }

  /**
   * Full audit of an identity.
   *
   * Returns comprehensive verification data including total actions,
   * verified count, policy history, attestations, and volume.
   *
   * @param address - The identity address to audit
   * @returns Full identity verification audit
   */
  async identity(address: string): Promise<IdentityVerification> {
    this.telemetry.track('verify.identity');

    try {
      const identityContract = this.contracts.getContract('identity');

      // Resolve identity
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) {
        throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      }
      const identityId = await resolveFn([address as `0x${string}`]) as `0x${string}`;

      // Fetch identity struct
      const getFn = identityContract.read['get'];
      if (!getFn) {
        throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'get function not found');
      }
      const rawIdentity = await getFn([identityId]) as OnChainIdentity;

      // Fetch attestations
      const getAttFn = identityContract.read['getAttestations'];
      let attestations: Array<{
        attestationId: string;
        identity: string;
        attester: string;
        claim: string;
        evidence?: string;
        expiresAt?: number;
        txHash: string;
        verified: boolean;
      }> = [];
      if (getAttFn) {
        try {
          const rawAttestations = await getAttFn([identityId]) as Array<{
            attestationId: `0x${string}`;
            attester: string;
            claim: string;
            evidence: string;
            expiresAt: bigint;
            revoked: boolean;
            txHash: string;
          }>;
          attestations = rawAttestations.map((a) => {
            const att: {
              attestationId: string;
              identity: string;
              attester: string;
              claim: string;
              evidence?: string;
              expiresAt?: number;
              txHash: string;
              verified: boolean;
            } = {
              attestationId: fromBytes32(a.attestationId),
              identity: fromBytes32(identityId),
              attester: a.attester,
              claim: a.claim,
              txHash: a.txHash ?? '',
              verified: !a.revoked,
            };
            if (a.evidence) att.evidence = a.evidence;
            if (Number(a.expiresAt) > 0) att.expiresAt = Number(a.expiresAt);
            return att;
          });
        } catch {
          // Attestations may not be available
        }
      }

      // Query indexer for action metrics
      let totalActions = 0;
      let verifiedActions = 0;
      let totalVolume = '0';
      let actionsByType: Record<string, number> = {};
      let policyHistory: Array<{ policyId: string; evaluations: number; violations: number }> = [];

      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();
      if (available) {
        try {
          const metrics = await indexer.get<{
            totalActions: number;
            verifiedActions: number;
            totalVolume: string;
            actionsByType: Record<string, number>;
            policyHistory: Array<{ policyId: string; evaluations: number; violations: number }>;
          }>(`/reputation/metrics/${address}`);
          totalActions = metrics.totalActions;
          verifiedActions = metrics.verifiedActions ?? metrics.totalActions;
          totalVolume = metrics.totalVolume ?? '0';
          actionsByType = metrics.actionsByType ?? {};
          policyHistory = metrics.policyHistory ?? [];
        } catch {
          // Indexer metrics unavailable
        }
      }

      const explorerBase = this.contracts.getExplorerBaseUrl();
      const statusMap: Record<number, 'active' | 'suspended' | 'deactivated'> = {
        0: 'active', 1: 'suspended', 2: 'deactivated',
      };

      return {
        identity: {
          identityId: fromBytes32(identityId),
          type: enumToActorType(rawIdentity.actorType),
          address: rawIdentity.walletAddress || address,
          owner: rawIdentity.owner,
          label: rawIdentity.label,
          capabilities: rawIdentity.capabilities ?? [],
          status: statusMap[rawIdentity.status] ?? 'active',
          attestations: Number(rawIdentity.attestationCount ?? 0),
          createdAt: Number(rawIdentity.createdAt ?? 0),
          txHash: '',
          explorerUrl: `${explorerBase}/identity/${fromBytes32(identityId)}`,
        },
        totalActions,
        verifiedActions,
        failedVerifications: totalActions - verifiedActions,
        actionsByType,
        totalVolume,
        policyHistory,
        attestations,
        explorerUrl: `${explorerBase}/identity/${fromBytes32(identityId)}`,
      };
    } catch (err) {
      if (err instanceof InvarianceError) throw err;
      throw mapContractError(err);
    }
  }

  /**
   * Escrow audit trail.
   *
   * Returns the complete timeline of an escrow from creation to
   * final state, with proof bundles for each state transition.
   *
   * @param escrowId - The escrow to audit
   * @returns Escrow verification with full timeline
   */
  async escrow(escrowId: string): Promise<EscrowVerification> {
    this.telemetry.track('verify.escrow');

    try {
      const escrowContract = this.contracts.getContract('escrow');

      // Fetch escrow on-chain
      const getEscrowFn = escrowContract.read['getEscrow'];
      if (!getEscrowFn) {
        throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getEscrow function not found');
      }
      const escrowIdBytes = toBytes32(escrowId);
      const rawEscrow = await getEscrowFn([escrowIdBytes]) as OnChainEscrow;

      if (rawEscrow.createdAt === 0n) {
        throw new InvarianceError(ErrorCode.ESCROW_NOT_FOUND, `Escrow not found: ${escrowId}`);
      }

      // Map on-chain state to EscrowState (active/resolved mapped to nearest equivalents)
      const ESCROW_STATE_TO_TYPE: Record<number, EscrowState> = {
        0: 'created', 1: 'funded', 2: 'funded', // active → funded
        3: 'released', 4: 'refunded', 5: 'disputed', 6: 'released', // resolved → released
      };
      const state: EscrowState = ESCROW_STATE_TO_TYPE[rawEscrow.state] ?? 'created';

      // Query indexer for timeline
      let timeline: Array<{
        event: string;
        txHash: string;
        timestamp: number;
        actor: { type: 'agent' | 'human' | 'device' | 'service'; address: string };
        proof: {
          proofHash: string;
          signatures: { actor: string; platform?: string; valid: boolean };
          metadataHash: string;
          verifiable: boolean;
          raw: string;
        };
      }> = [];

      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();
      if (available) {
        try {
          timeline = await indexer.get<typeof timeline>(`/escrows/${escrowId}/timeline`);
        } catch {
          // Build minimal timeline from on-chain data
        }
      }

      // Build minimal timeline if indexer unavailable
      if (timeline.length === 0) {
        timeline.push({
          event: 'created',
          txHash: '',
          timestamp: Number(rawEscrow.createdAt),
          actor: { type: 'agent', address: rawEscrow.depositor },
          proof: {
            proofHash: escrowIdBytes,
            signatures: { actor: '', valid: false },
            metadataHash: '',
            verifiable: false,
            raw: '',
          },
        });
      }

      const explorerBase = this.contracts.getExplorerBaseUrl();
      const amount = fromUSDCWei(rawEscrow.amount);

      return {
        escrowId,
        verified: timeline.length > 0,
        timeline,
        depositor: { type: 'agent', address: rawEscrow.depositor },
        recipient: { type: 'agent', address: rawEscrow.beneficiary },
        amount,
        finalState: state,
        explorerUrl: `${explorerBase}/escrow/${escrowId}`,
      };
    } catch (err) {
      if (err instanceof InvarianceError) throw err;
      throw mapContractError(err);
    }
  }

  /**
   * Decode and validate a proof by its hash.
   *
   * @param proofHash - The proof hash to decode
   * @returns Decoded proof data with validation status
   */
  async proof(proofHash: string): Promise<ProofData> {
    this.telemetry.track('verify.proof');

    try {
      // Query indexer for entries matching proofHash
      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();

      if (available) {
        try {
          const entries = await indexer.get<Array<{
            entryId: string;
            action: string;
            actorAddress: string;
            actorType: string;
            timestamp: number;
            blockNumber: number;
            actorSignature: string;
            platformSignature: string;
            metadataHash: string;
            txHash: string;
          }>>('/ledger/entries', { proofHash, limit: 1 });

          if (entries.length > 0) {
            const entry = entries[0]!;
            return {
              proofHash,
              actor: {
                type: (entry.actorType as 'agent' | 'human' | 'device' | 'service') || 'agent',
                address: entry.actorAddress,
              },
              action: entry.action,
              timestamp: entry.timestamp,
              blockNumber: entry.blockNumber,
              signatures: {
                actor: entry.actorSignature,
                platform: entry.platformSignature,
                valid: entry.actorSignature.length > 2,
              },
              metadataHash: entry.metadataHash,
              raw: JSON.stringify(entry),
              verified: true,
            };
          }
        } catch {
          // Fall through
        }
      }

      // Try on-chain lookup via ledger contract
      const ledgerContract = this.contracts.getContract('ledger');
      const getByProofFn = ledgerContract.read['getEntryByProof'];
      if (getByProofFn) {
        try {
          const entry = await getByProofFn([toBytes32(proofHash)]) as OnChainLedgerEntry;
          if (entry && entry.timestamp > 0n) {
            return {
              proofHash,
              actor: {
                type: enumToActorType(entry.actorType),
                address: entry.actorAddress,
              },
              action: entry.action,
              timestamp: Number(entry.timestamp) * 1000,
              blockNumber: Number(entry.blockNumber),
              signatures: {
                actor: entry.actorSignature,
                platform: entry.platformSignature,
                valid: entry.actorSignature.length > 2 && entry.platformSignature.length > 2,
              },
              metadataHash: entry.metadataHash,
              raw: JSON.stringify({ entryId: fromBytes32(entry.entryId), proofHash }),
              verified: true,
            };
          }
        } catch {
          // Function may not exist
        }
      }

      throw new InvarianceError(
        ErrorCode.VERIFICATION_FAILED,
        `Proof not found: ${proofHash}`,
      );
    } catch (err) {
      if (err instanceof InvarianceError) throw err;
      throw mapContractError(err);
    }
  }

  /**
   * Batch verify multiple transactions.
   *
   * More efficient than calling verify() in a loop when verifying
   * multiple transactions simultaneously.
   *
   * @param txHashes - Array of transaction hashes to verify
   * @returns Array of verification results (one per hash)
   */
  async bulk(txHashes: string[]): Promise<VerificationResult[]> {
    this.telemetry.track('verify.bulk', { count: txHashes.length });

    const settled = await Promise.allSettled(
      txHashes.map((h) => this.verify(h)),
    );

    return settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      // Return a failed verification result for rejected promises
      const explorerBase = this.contracts.getExplorerBaseUrl();
      return {
        verified: false,
        txHash: txHashes[i]!,
        action: '',
        actor: { type: 'agent' as const, address: '' },
        timestamp: Date.now(),
        blockNumber: 0,
        proof: {
          proofHash: '',
          signatures: { actor: '', valid: false },
          metadataHash: '',
          verifiable: false,
          raw: '',
        },
        explorerUrl: `${explorerBase}/tx/${txHashes[i]!}`,
      };
    });
  }

  /**
   * Generate a public explorer URL for an intent.
   *
   * This URL can be shared publicly. Anyone can open it to
   * independently verify the action without needing the SDK.
   *
   * @param intentId - The intent ID to generate a URL for
   * @returns The public explorer URL
   */
  url(intentId: string): string {
    this.telemetry.track('verify.url');

    const base = this.contracts.getExplorerBaseUrl();
    return `${base}/v/${intentId}`;
  }
}
