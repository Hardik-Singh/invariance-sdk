/**
 * Time-expiring verification with sybil resistance.
 * Serves: Tinder+World ID, Hicky, Luna, Gitcoin Passport, Polygon ID, government ID programs.
 *
 * @example
 * ```typescript
 * const gatekeeper = new IdentityGatekeeper(inv);
 * const credential = await gatekeeper.verifyAndGate({
 *   identityId: 'identity-123',
 *   platform: 'world-id',
 *   validityMs: 365 * 24 * 60 * 60 * 1000,
 *   sybilResistant: true,
 * });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';

/** Verification credential */
export interface VerificationCredential {
  /** Identity ID of the verified entity */
  identityId: string;
  /** Platform that issued the verification */
  platform: string;
  /** When the verification was issued (ms since epoch) */
  issuedAt: number;
  /** When the verification expires (ms since epoch) */
  expiresAt: number;
  /** Transaction hash of the attestation */
  txHash: string;
  /** Whether still valid */
  active: boolean;
}

/** Options for verifying and gating */
export interface VerifyAndGateOptions {
  /** Identity to verify */
  identityId: string;
  /** Platform name (e.g., 'world-id', 'polygon-id', 'civic') */
  platform: string;
  /** Verification validity duration in milliseconds (default: 365 days) */
  validityMs?: number;
  /** External proof (e.g., World ID proof, Polygon ID credential) */
  proof?: string;
  /** Enforce 1-identity-per-platform (default: true) */
  sybilResistant?: boolean;
}

/** Access log entry */
export interface AccessLogEntry {
  /** Who queried the identity data */
  queriedBy: string;
  /** Identity that was queried */
  identityId: string;
  /** What data was accessed */
  dataAccessed: string;
  /** Timestamp */
  timestamp: number;
  /** Ledger entry ID */
  entryId: string;
}

/**
 * IdentityGatekeeper — time-expiring verification with sybil resistance.
 */
export class IdentityGatekeeper {
  private readonly client: Invariance;
  private readonly platformRegistry = new Map<string, Set<string>>();
  private readonly credentials = new Map<string, VerificationCredential>();

  constructor(client: Invariance) {
    this.client = client;
  }

  /**
   * Verify an identity and issue a time-bounded credential.
   * Enforces 1-identity-per-platform when sybilResistant is true.
   */
  async verifyAndGate(opts: VerifyAndGateOptions): Promise<VerificationCredential> {
    const {
      identityId,
      platform,
      validityMs = 365 * 24 * 60 * 60 * 1000,
      sybilResistant = true,
    } = opts;

    // Check for existing valid credential
    if (sybilResistant) {
      const existing = this.platformRegistry.get(platform);
      if (existing?.has(identityId)) {
        const cred = this.credentials.get(`${identityId}:${platform}`);
        if (cred && cred.active && cred.expiresAt > Date.now()) {
          return cred;
        }
      }
    }

    const now = Date.now();
    const expiresAt = now + validityMs;

    const attestation = await this.client.identity.attest(identityId, {
      key: `verification:${platform}`,
      value: JSON.stringify({
        platform,
        issuedAt: now,
        expiresAt,
        proof: opts.proof,
        sybilResistant,
      }),
    });

    const credential: VerificationCredential = {
      identityId,
      platform,
      issuedAt: now,
      expiresAt,
      txHash: attestation.txHash,
      active: true,
    };

    this.credentials.set(`${identityId}:${platform}`, credential);
    if (sybilResistant) {
      if (!this.platformRegistry.has(platform)) {
        this.platformRegistry.set(platform, new Set());
      }
      this.platformRegistry.get(platform)!.add(identityId);
    }

    return credential;
  }

  /**
   * Check if an identity has valid (non-expired) verification.
   */
  isVerified(identityId: string, platform: string): boolean {
    const cred = this.credentials.get(`${identityId}:${platform}`);
    if (!cred) return false;
    return cred.active && cred.expiresAt > Date.now();
  }

  /**
   * Revoke expired verifications. Returns count of revoked credentials.
   */
  revokeExpired(platform?: string): number {
    let revoked = 0;
    const now = Date.now();

    for (const [key, cred] of this.credentials) {
      if (platform && cred.platform !== platform) continue;
      if (cred.active && cred.expiresAt <= now) {
        cred.active = false;
        this.credentials.set(key, cred);
        this.platformRegistry.get(cred.platform)?.delete(cred.identityId);
        revoked++;
      }
    }

    return revoked;
  }

  /**
   * Log an access event for GDPR compliance.
   */
  async accessLog(
    queriedBy: string,
    identityId: string,
    dataAccessed: string,
  ): Promise<AccessLogEntry> {
    const entry = await this.client.ledger.log({
      action: 'identity-access',
      actor: { type: 'service' as const, address: queriedBy },
      category: 'custom',
      metadata: { identityId, dataAccessed, queriedBy, purpose: 'identity-verification-access' },
    });

    return {
      queriedBy,
      identityId,
      dataAccessed,
      timestamp: Date.now(),
      entryId: entry.entryId,
    };
  }

  /**
   * Get all active credentials for an identity.
   */
  getCredentials(identityId: string): VerificationCredential[] {
    const results: VerificationCredential[] = [];
    for (const [key, cred] of this.credentials) {
      if (key.startsWith(`${identityId}:`) && cred.active) {
        results.push(cred);
      }
    }
    return results;
  }
}
