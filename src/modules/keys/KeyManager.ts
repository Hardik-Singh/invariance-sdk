import type { KeyManagerConfig, KeyPairResult, SignResult } from './types.js';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { ErrorCode } from '@invariance/common';

/**
 * SDK client for server-side key management via Supabase Vault.
 *
 * Thin HTTP client calling `/v1/keys/*` endpoints. Private keys
 * never leave the server — only public keys and signatures are returned.
 *
 * @example
 * ```typescript
 * const keys = new KeyManager({
 *   apiUrl: 'https://api.invariance.dev',
 *   accessToken: supabaseSession.access_token,
 * });
 *
 * const { publicKey, keyId } = await keys.generateKeyPair();
 * const { signature } = await keys.signAction(messageBytes);
 * ```
 */
export class KeyManager {
  private readonly config: KeyManagerConfig;
  private readonly hasV1Prefix: boolean;

  constructor(config: KeyManagerConfig) {
    this.config = config;
    this.hasV1Prefix = config.apiUrl.replace(/\/$/, '').endsWith('/v1');
  }

  /** Generate a new keypair. Returns the public key and key ID. */
  async generateKeyPair(): Promise<KeyPairResult> {
    return this.post<KeyPairResult>('/keys/generate');
  }

  /** Get the user's active public key. */
  async getPublicKey(): Promise<string> {
    const result = await this.get<{ publicKey: string }>('/keys/public');
    return result.publicKey;
  }

  /** Sign a message using the server-side key. */
  async signAction(message: Uint8Array): Promise<SignResult> {
    const hex = Array.from(message, (b) => b.toString(16).padStart(2, '0')).join('');
    return this.post<SignResult>('/keys/sign', { message: hex });
  }

  /** Verify a signature against a public key (client-side convenience). */
  async verifySignature(message: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
    try {
      const { verifyMessage } = await import('viem');
      return await verifyMessage({
        address: publicKey as `0x${string}`,
        message: { raw: message },
        signature: signature as `0x${string}`,
      });
    } catch {
      return false;
    }
  }

  /** Revoke a keypair by key ID. */
  async revokeKeyPair(keyId: string): Promise<void> {
    await this.post<{ success: boolean }>('/keys/revoke', { keyId });
  }

  /** Rotate the keypair (revoke current + generate new). */
  async rotateKeyPair(): Promise<KeyPairResult> {
    return this.post<KeyPairResult>('/keys/rotate');
  }

  private buildUrl(path: string): string {
    const base = this.config.apiUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (this.hasV1Prefix) {
      return `${base}${normalizedPath}`;
    }
    return `${base}/v1${normalizedPath}`;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.accessToken}`,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        body.error?.message ?? `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json() as { data: T };
    return payload.data;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const resBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        resBody.error?.message ?? `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json() as { data: T };
    return payload.data;
  }
}
