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
  private readonly apiKey: string | undefined;
  private readonly hasV1Prefix: boolean;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.hasV1Prefix = this.baseUrl.endsWith('/v1');
  }

  /**
   * Perform a GET request to the indexer API.
   *
   * @param path - The API path (e.g., '/identities')
   * @param params - Optional query parameters
   * @returns The parsed JSON response
   */
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.buildUrl(path, true));
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
          headers: this.buildHeaders(),
        });

        clearTimeout(timeout);

        if (response.ok) {
          const payload = await response.json() as unknown;
          if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
            return (payload as { data: T }).data;
          }
          return payload as T;
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
   * Perform a GET request and return both data and metadata (including total count).
   *
   * @param path - The API path
   * @param params - Optional query parameters
   * @returns Object with data array and total count
   */
  async getPaginated<T>(path: string, params?: Record<string, string | number | undefined>): Promise<{ data: T[]; total: number }> {
    const url = new URL(this.buildUrl(path, true));
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
          headers: this.buildHeaders(),
        });

        clearTimeout(timeout);

        if (response.ok) {
          const payload = await response.json() as unknown;
          if (payload && typeof payload === 'object') {
            const obj = payload as Record<string, unknown>;
            const data = (Array.isArray(obj['data']) ? obj['data'] : []) as T[];
            const meta = obj['meta'] as Record<string, unknown> | undefined;
            const total = typeof meta?.['total'] === 'number' ? meta['total'] as number : data.length;
            return { data, total };
          }
          return { data: [] as T[], total: 0 };
        }

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

      const response = await fetch(this.buildUrl('/health', false), {
        signal: controller.signal,
        headers: this.buildHeaders(),
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Build common headers, including api key when configured. */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  /** Build a fully qualified URL with optional /v1 prefix */
  private buildUrl(path: string, useV1: boolean): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (!useV1) {
      return `${this.baseUrl}${normalized}`;
    }
    if (this.hasV1Prefix) {
      return `${this.baseUrl}${normalized.startsWith('/v1') ? normalized.slice(3) : normalized}`;
    }
    return `${this.baseUrl}${normalized.startsWith('/v1') ? normalized : `/v1${normalized}`}`;
  }
}
