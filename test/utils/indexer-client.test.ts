import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexerClient } from '../../src/utils/indexer-client.js';

describe('IndexerClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('x-api-key header', () => {
    it('includes x-api-key header when apiKey is provided', async () => {
      const mockResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
      vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as Response);

      const client = new IndexerClient('https://api.example.com', 'test-key-123');
      await client.get('/identities');

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      const [, options] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(options?.headers).toEqual(
        expect.objectContaining({ 'x-api-key': 'test-key-123' }),
      );
    });

    it('omits x-api-key header when apiKey is not provided', async () => {
      const mockResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
      vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as Response);

      const client = new IndexerClient('https://api.example.com');
      await client.get('/identities');

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      const [, options] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = options?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBeUndefined();
    });

    it('includes x-api-key header in isAvailable health check', async () => {
      const mockResponse = { ok: true };
      vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as Response);

      const client = new IndexerClient('https://api.example.com', 'health-key');
      await client.isAvailable();

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      const [, options] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(options?.headers).toEqual(
        expect.objectContaining({ 'x-api-key': 'health-key' }),
      );
    });
  });
});
