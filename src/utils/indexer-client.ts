import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../errors/InvarianceError.js';

/** Default timeout for indexer requests (5 seconds) */
const DEFAULT_TIMEOUT = 5000;

/** Maximum retries on 5xx errors */
const MAX_RETRIES = 1;

/**
 * Lightweight fetch wrapper for the Invariance indexer REST API.
 *
 * Built-in timeout, retry on 5xx, and graceful degradation.
 * Used by modules that need paginated/filtered read queries.
 */
export class IndexerClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Perform a GET request to the indexer API.
   *
   * @param path - The API path (e.g., '/identities')
   * @param params - Optional query parameters
   * @returns The parsed JSON response
   */
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });

        clearTimeout(timeout);

        if (response.ok) {
          return (await response.json()) as T;
        }

        // Retry on 5xx
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`Indexer returned ${response.status}`);
          continue;
        }

        throw new InvarianceError(
          ErrorCode.NETWORK_ERROR,
          `Indexer request failed: ${response.status} ${response.statusText}`,
        );
      } catch (err) {
        if (err instanceof InvarianceError) throw err;
        lastError = err;
        if (attempt < MAX_RETRIES) continue;
      }
    }

    throw new InvarianceError(
      ErrorCode.NETWORK_ERROR,
      `Indexer unavailable: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
    );
  }

  /**
   * Check if the indexer API is reachable.
   *
   * @returns true if the indexer responds to a health check
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}
