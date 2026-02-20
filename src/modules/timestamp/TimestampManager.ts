import type { TimestampProof, TimestampVerification, TimestampConfig } from './types.js';
import type { LedgerEntry, OffchainLedgerEntry } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { ErrorCode } from '@invariance/common';
import type { Telemetry } from '../../core/Telemetry.js';

// Package name stored in a variable to prevent bundlers from statically
// resolving the optional peer dependency at build/transform time.
const OTS_PACKAGE = 'opentimestamps';

/**
 * Convert a hex string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Sort object keys recursively for deterministic JSON serialization.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * OpenTimestamps integration for the Invariance SDK.
 *
 * Provides lightweight, neutral timestamp proofs for arbitrary data hashes.
 * Proofs are eventually anchored to Bitcoin via public calendar servers —
 * zero cost, decentralized, cryptographic.
 *
 * @example
 * ```typescript
 * // Stamp a hash
 * const proof = await inv.timestamp.stamp('abcdef1234...');
 *
 * // Stamp a ledger entry
 * const proof = await inv.timestamp.stampEntry(entry);
 *
 * // Upgrade a pending proof (after Bitcoin confirmation)
 * const upgraded = await inv.timestamp.upgrade(proof);
 *
 * // Verify a proof
 * const result = await inv.timestamp.verify(hash, proof);
 * ```
 */
export class TimestampManager {
  private readonly config: TimestampConfig;
  private readonly telemetry: Telemetry;

  constructor(config: TimestampConfig, telemetry: Telemetry) {
    this.config = config;
    this.telemetry = telemetry;
  }

  /**
   * Load the OpenTimestamps library. Override in tests.
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async _loadOTS(): Promise<any> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await (Function('p', 'return import(p)') as (p: string) => Promise<any>)(OTS_PACKAGE);
      return mod.default ?? mod;
    } catch {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        'opentimestamps package is not installed. Run: npm install opentimestamps',
      );
    }
  }

  /**
   * Stamp an arbitrary hex hash.
   *
   * Submits the hash to OpenTimestamps calendar servers and returns
   * a pending proof that can later be upgraded once anchored to Bitcoin.
   *
   * @param hash - SHA-256 hex digest to timestamp
   * @returns A pending timestamp proof
   */
  async stamp(hash: string): Promise<TimestampProof> {
    const OTS = await this._loadOTS();

    const hashBytes = hexToBytes(hash);
    const detached = OTS.DetachedTimestampFile.fromHash(
      new OTS.Ops.OpSHA256(),
      hashBytes,
    );

    const options: Record<string, unknown> = {};
    if (this.config.calendars?.length) {
      options['calendars'] = this.config.calendars;
    }

    await OTS.stamp(detached, options);

    const otsBytes: Uint8Array = detached.serializeToBytes();
    const otsData = Buffer.from(otsBytes).toString('base64');

    const calendarUrl = this.config.calendars?.[0];
    const proof: TimestampProof = {
      hash,
      otsData,
      status: 'pending',
      ...(calendarUrl !== undefined ? { calendarUrl } : {}),
      createdAt: Date.now(),
    };

    this.telemetry.track('timestamp.stamp', { hash: hash.slice(0, 16) });

    return proof;
  }

  /**
   * Upgrade a pending proof to a fully Bitcoin-verified proof.
   *
   * Polls the calendar server for Bitcoin anchor data. If the proof
   * is not yet anchored, the original proof is returned unchanged.
   *
   * @param proof - A pending timestamp proof to upgrade
   * @returns The upgraded proof (or unchanged if not yet anchored)
   */
  async upgrade(proof: TimestampProof): Promise<TimestampProof> {
    if (proof.status === 'verified') return proof;

    const OTS = await this._loadOTS();

    const otsBytes = new Uint8Array(Buffer.from(proof.otsData, 'base64'));
    const detached = OTS.DetachedTimestampFile.deserialize(otsBytes);

    const changed: boolean = await OTS.upgrade(detached);

    if (!changed) {
      return proof;
    }

    const upgradedBytes: Uint8Array = detached.serializeToBytes();
    const upgraded: TimestampProof = {
      ...proof,
      otsData: Buffer.from(upgradedBytes).toString('base64'),
      status: 'verified',
    };

    // Extract Bitcoin attestation info from the upgraded timestamp
    const info = await this.extractBitcoinInfo(OTS, detached);
    if (info.blockHeight !== undefined) upgraded.bitcoinBlockHeight = info.blockHeight;
    if (info.txId !== undefined) upgraded.bitcoinTxId = info.txId;

    this.telemetry.track('timestamp.upgrade', {
      hash: proof.hash.slice(0, 16),
      verified: true,
    });

    return upgraded;
  }

  /**
   * Verify a proof against a hash.
   *
   * @param hash - The SHA-256 hex digest that was originally stamped
   * @param proof - The timestamp proof to verify
   * @returns Verification result with attestation details
   */
  async verify(hash: string, proof: TimestampProof): Promise<TimestampVerification> {
    if (proof.hash !== hash) {
      return { valid: false };
    }

    const OTS = await this._loadOTS();

    const otsBytes = new Uint8Array(Buffer.from(proof.otsData, 'base64'));
    const detached = OTS.DetachedTimestampFile.deserialize(otsBytes);

    try {
      const results = await OTS.verify(detached);

      if (!results || Object.keys(results).length === 0) {
        return { valid: proof.status === 'pending' };
      }

      // results is keyed by attestation type; Bitcoin attestation has block height as value
      const bitcoinKey = Object.keys(results).find(
        (k) => typeof results[k] === 'number',
      );

      if (bitcoinKey !== undefined) {
        const attestedTime = results[bitcoinKey] as number;
        const result: TimestampVerification = {
          valid: true,
          attestedTime,
        };
        if (proof.bitcoinBlockHeight !== undefined) {
          result.bitcoinBlockHeight = proof.bitcoinBlockHeight;
        }
        return result;
      }

      return { valid: true };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Stamp a ledger entry by hashing its content.
   *
   * Creates a deterministic SHA-256 digest from the entry's
   * JSON-serialized content (with sorted keys) and stamps it.
   *
   * @param entry - An on-chain or off-chain ledger entry
   * @returns A pending timestamp proof for the entry
   */
  async stampEntry(entry: OffchainLedgerEntry | LedgerEntry): Promise<TimestampProof> {
    const sorted = sortKeys(entry);
    const json = JSON.stringify(sorted);

    // Use Web Crypto API (available in Node 18+) for SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const hash = Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return this.stamp(hash);
  }

  /**
   * Extract Bitcoin block info from an upgraded OTS timestamp.
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async extractBitcoinInfo(OTS: any, detached: any): Promise<{
    blockHeight?: number;
    txId?: string;
  }> {
    try {
      const results = await OTS.verify(detached);
      if (results) {
        for (const [, value] of Object.entries(results)) {
          if (typeof value === 'number') {
            return { blockHeight: value };
          }
        }
      }
    } catch {
      // Verification may fail for pending proofs
    }
    return {};
  }
}
