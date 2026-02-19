/** Configuration for the KeyManager module. */
export interface KeyManagerConfig {
  /** API base URL (e.g. https://api.invariance.dev) */
  apiUrl: string;
  /** Supabase access token for session auth */
  accessToken: string;
}

/** Result of key generation or rotation. */
export interface KeyPairResult {
  publicKey: string;
  keyId: string;
}

/** Result of a signing operation. */
export interface SignResult {
  signature: string;
  publicKey: string;
}
