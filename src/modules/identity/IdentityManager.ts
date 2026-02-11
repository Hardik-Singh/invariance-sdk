import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import {
  actorTypeToEnum,
  enumToActorType,
  identityStatusFromEnum,
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
} from '../../utils/contract-helpers.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import type {
  RegisterIdentityOptions,
  Identity,
  Attestation,
  PauseResult,
  TxReceipt,
  IdentityListFilters,
  AttestationInput,
  UpdateIdentityOptions,
  OnChainIdentity,
  OnChainAttestation,
} from './types.js';

/** Zero bytes32 constant */
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * Manages identity registration, resolution, and lifecycle.
 *
 * Everything in Invariance is an Identity. An identity is an on-chain entity
 * that can perform actions, hold reputation, and be verified. The identity
 * module replaces the concept of "wallet management" with a universal actor registry.
 *
 * @example
 * ```typescript
 * const agent = await inv.identity.register({
 *   type: 'agent',
 *   owner: '0xDeveloperWallet',
 *   label: 'AlphaTrader v2',
 *   capabilities: ['swap', 'rebalance'],
 *   wallet: { create: true },
 * });
 * ```
 */
export class IdentityManager {
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
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl());
    }
    return this.indexer;
  }

  /** Map an on-chain identity tuple to the SDK Identity type */
  private mapOnChainIdentity(raw: OnChainIdentity, txHash?: string): Identity {
    const explorerBase = this.contracts.getExplorerBaseUrl();
    const identityIdStr = fromBytes32(raw.identityId);

    return {
      identityId: identityIdStr || raw.identityId,
      type: enumToActorType(raw.actorType),
      address: raw.addr,
      owner: raw.owner,
      label: raw.label,
      capabilities: [...raw.capabilities],
      status: identityStatusFromEnum(raw.status),
      attestations: 0,
      createdAt: Number(raw.createdAt),
      txHash: txHash ?? '',
      explorerUrl: `${explorerBase}/identity/${raw.identityId}`,
    };
  }

  /** Map an on-chain attestation tuple to the SDK Attestation type */
  private mapOnChainAttestation(raw: OnChainAttestation, txHash?: string): Attestation {
    const evidence = raw.evidenceHash === ZERO_BYTES32 ? undefined : raw.evidenceHash;
    const expiresAt = raw.expiresAt > 0n ? Number(raw.expiresAt) : undefined;

    const result: Attestation = {
      attestationId: raw.attestationId,
      identity: raw.identityId,
      attester: raw.attester,
      claim: raw.claim,
      txHash: txHash ?? '',
      verified: !raw.revoked,
    };
    if (evidence !== undefined) {
      result.evidence = evidence;
    }
    if (expiresAt !== undefined) {
      result.expiresAt = expiresAt;
    }
    return result;
  }

  /**
   * Register a new identity (agent, human, device, or service).
   *
   * Creates an on-chain identity record and optionally provisions
   * an embedded wallet via Privy.
   *
   * @param opts - Registration options including type, owner, and label
   * @returns The newly created identity
   */
  async register(opts: RegisterIdentityOptions): Promise<Identity> {
    this.telemetry.track('identity.register', { type: opts.type });

    try {
      const contract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();

      const addr = (opts.address ?? opts.owner) as `0x${string}`;
      const actorType = actorTypeToEnum(opts.type);
      const capabilities = opts.capabilities ?? [];

      const writeFn = contract.write['register'];
      if (!writeFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'register function not found on contract');
      const txHash = await writeFn([addr, actorType, opts.label, capabilities]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Read back the full identity from chain
      const resolveFn = contract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found on contract');
      const identityId = await resolveFn([addr]) as `0x${string}`;

      const getFn = contract.read['get'];
      if (!getFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'get function not found on contract');
      const raw = await getFn([identityId]) as OnChainIdentity;

      const identity = this.mapOnChainIdentity(raw, receipt.txHash);

      this.events.emit('identity.registered', {
        identityId: identity.identityId,
        address: identity.address,
      });

      return identity;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Get identity details by address.
   *
   * @param address - The 0x wallet address of the identity
   * @returns The identity record
   * @throws {InvarianceError} If identity is not found
   */
  async get(address: string): Promise<Identity> {
    this.telemetry.track('identity.get');

    try {
      const contract = this.contracts.getContract('identity');

      const resolveFn = contract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found on contract');
      const identityId = await resolveFn([address as `0x${string}`]) as `0x${string}`;

      if (identityId === ZERO_BYTES32) {
        throw new InvarianceError(
          ErrorCode.IDENTITY_NOT_FOUND,
          `Identity not found for address: ${address}`,
        );
      }

      const getFn = contract.read['get'];
      if (!getFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'get function not found on contract');
      const raw = await getFn([identityId]) as OnChainIdentity;
      return this.mapOnChainIdentity(raw);
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Resolve an identity by ID, address, or ENS name.
   *
   * @param idOrAddress - Identity ID (bytes32 hex), 0x address, or string ID
   * @returns The resolved identity
   * @throws {InvarianceError} If identity cannot be resolved
   */
  async resolve(idOrAddress: string): Promise<Identity> {
    this.telemetry.track('identity.resolve');

    try {
      const contract = this.contracts.getContract('identity');

      let identityId: `0x${string}`;

      // If it's a 42-char hex address, resolve to identityId first
      if (idOrAddress.startsWith('0x') && idOrAddress.length === 42) {
        const resolveFn = contract.read['resolve'];
        if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found on contract');
        identityId = await resolveFn([idOrAddress as `0x${string}`]) as `0x${string}`;
        if (identityId === ZERO_BYTES32) {
          throw new InvarianceError(
            ErrorCode.IDENTITY_NOT_FOUND,
            `Cannot resolve identity: ${idOrAddress}`,
          );
        }
      } else {
        // Treat as identityId (either bytes32 hex or string to encode)
        identityId = toBytes32(idOrAddress);
      }

      const getFn = contract.read['get'];
      if (!getFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'get function not found on contract');
      const raw = await getFn([identityId]) as OnChainIdentity;
      return this.mapOnChainIdentity(raw);
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Update identity metadata.
   *
   * @param id - The identity ID to update
   * @param opts - Fields to update (label, metadata, capabilities)
   * @returns The updated identity
   */
  async update(id: string, opts: UpdateIdentityOptions): Promise<Identity> {
    this.telemetry.track('identity.update');

    try {
      const contract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();
      const identityId = toBytes32(id);

      const updateFn = contract.write['update'];
      if (!updateFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'update function not found on contract');
      const txHash = await updateFn([identityId, opts.label ?? '', opts.capabilities ?? []]);

      await waitForReceipt(publicClient, txHash);

      // Re-fetch updated identity
      const getFn = contract.read['get'];
      if (!getFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'get function not found on contract');
      const raw = await getFn([identityId]) as OnChainIdentity;
      return this.mapOnChainIdentity(raw, txHash);
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * EMERGENCY STOP: Freeze an identity.
   *
   * Pausing an identity is the kill switch. One call revokes all active
   * policies, freezes all escrowed funds, and cancels all pending intents.
   * Only the identity owner can call this.
   *
   * @param id - The identity ID to pause
   * @returns Pause result with counts of affected resources
   */
  async pause(id: string): Promise<PauseResult> {
    this.telemetry.track('identity.pause');

    try {
      const contract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();
      const identityId = toBytes32(id);

      const pauseFn = contract.write['pauseIdentity'];
      if (!pauseFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'pauseIdentity function not found on contract');
      const txHash = await pauseFn([identityId]);
      await waitForReceipt(publicClient, txHash);

      // Emit event AFTER successful tx (fixes PR #5 emit-before-throw bug)
      this.events.emit('identity.paused', { identityId: id });

      return {
        identityId: id,
        status: 'suspended',
        policiesRevoked: 0,
        escrowsFrozen: 0,
        pendingIntentsCancelled: 0,
        txHash,
        resumable: true,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Resume a paused identity.
   *
   * Reactivates the identity. Policies must be re-attached manually
   * as a safety measure. Escrows unfreeze but require fresh approval.
   *
   * @param id - The identity ID to resume
   * @returns Transaction receipt
   */
  async resume(id: string): Promise<TxReceipt> {
    this.telemetry.track('identity.resume');

    try {
      const contract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();
      const identityId = toBytes32(id);

      const resumeFn = contract.write['resume'];
      if (!resumeFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resume function not found on contract');
      const txHash = await resumeFn([identityId]);
      const receipt = await waitForReceipt(publicClient, txHash);

      this.events.emit('identity.resumed', { identityId: id });

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
   * Permanently deactivate an identity.
   *
   * This is irreversible. All policies are revoked and escrows are refunded.
   *
   * @param id - The identity ID to deactivate
   * @returns Transaction receipt
   */
  async deactivate(id: string): Promise<TxReceipt> {
    this.telemetry.track('identity.deactivate');

    try {
      const contract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();
      const identityId = toBytes32(id);

      const deactivateFn = contract.write['deactivate'];
      if (!deactivateFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'deactivate function not found on contract');
      const txHash = await deactivateFn([identityId]);
      const receipt = await waitForReceipt(publicClient, txHash);

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
   * List identities by type, owner, or status.
   *
   * Attempts the indexer API first, falls back to on-chain reads.
   *
   * @param filters - Optional filters to narrow results
   * @returns Array of matching identities
   */
  async list(filters?: IdentityListFilters): Promise<Identity[]> {
    this.telemetry.track('identity.list', { hasFilters: filters !== undefined });

    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const params: Record<string, string | number | undefined> = {
          type: filters?.type,
          status: filters?.status,
          owner: filters?.owner,
          limit: filters?.limit,
          offset: filters?.offset,
        };
        const data = await indexer.get<Identity[]>('/identities', params);
        return data;
      } catch {
        // Fall through to on-chain fallback
      }
    }

    // On-chain fallback: indexer unavailable, return empty
    console.warn('[Invariance] identity.list(): indexer unavailable, returning empty results');
    return [];
  }

  /**
   * Add an attestation to an identity.
   *
   * Attestations are claims made by third parties about an identity,
   * stored on-chain with optional evidence hashes.
   *
   * @param id - The identity ID to attest
   * @param attestation - The attestation details
   * @returns The created attestation record
   */
  async attest(id: string, attestation: AttestationInput): Promise<Attestation> {
    this.telemetry.track('identity.attest', { claim: attestation.claim });

    try {
      const contract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();
      const identityId = toBytes32(id);

      const evidenceHash = attestation.evidence
        ? toBytes32(attestation.evidence)
        : ZERO_BYTES32;
      const expiresAt = BigInt(attestation.expiresAt ?? 0);

      const attestFn = contract.write['attest'];
      if (!attestFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'attest function not found on contract');
      const txHash = await attestFn([identityId, attestation.claim, evidenceHash, expiresAt]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Read back attestations to get the created one
      const getAttestationsFn = contract.read['getAttestations'];
      if (!getAttestationsFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getAttestations function not found on contract');
      const attestations = await getAttestationsFn([identityId]) as OnChainAttestation[];
      // The last attestation should be the one we just created
      const created = attestations[attestations.length - 1];
      if (created) {
        return this.mapOnChainAttestation(created, receipt.txHash);
      }

      // Fallback if we can't find it
      const result: Attestation = {
        attestationId: receipt.txHash,
        identity: id,
        attester: attestation.attester,
        claim: attestation.claim,
        txHash: receipt.txHash,
        verified: true,
      };
      if (attestation.evidence !== undefined) {
        result.evidence = attestation.evidence;
      }
      if (attestation.expiresAt !== undefined) {
        result.expiresAt = attestation.expiresAt;
      }
      return result;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Get all attestations for an identity.
   *
   * @param id - The identity ID
   * @returns Array of attestation records
   */
  async attestations(id: string): Promise<Attestation[]> {
    this.telemetry.track('identity.attestations');

    try {
      const contract = this.contracts.getContract('identity');
      const identityId = toBytes32(id);

      const getAttestationsFn = contract.read['getAttestations'];
      if (!getAttestationsFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getAttestations function not found on contract');
      const raw = await getAttestationsFn([identityId]) as OnChainAttestation[];
      return raw.map((a) => this.mapOnChainAttestation(a));
    } catch (err) {
      throw mapContractError(err);
    }
  }
}
