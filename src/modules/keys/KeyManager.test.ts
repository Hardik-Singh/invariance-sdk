import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyManager } from './KeyManager.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('KeyManager (SDK)', () => {
  let keys: KeyManager;

  beforeEach(() => {
    keys = new KeyManager({
      apiUrl: 'https://api.invariance.dev',
      accessToken: 'test-token',
    });
    mockFetch.mockReset();
  });

  function mockResponse(status: number, data: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => (status >= 200 && status < 300 ? { data } : { error: { message: 'Error' } }),
    });
  }

  describe('generateKeyPair', () => {
    it('calls POST /v1/keys/generate', async () => {
      mockResponse(201, { publicKey: '0xabc', keyId: 'k1' });

      const result = await keys.generateKeyPair();

      expect(result.publicKey).toBe('0xabc');
      expect(result.keyId).toBe('k1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.invariance.dev/v1/keys/generate',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getPublicKey', () => {
    it('calls GET /v1/keys/public', async () => {
      mockResponse(200, { publicKey: '0xdef' });

      const result = await keys.getPublicKey();

      expect(result).toBe('0xdef');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.invariance.dev/v1/keys/public',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('signAction', () => {
    it('sends hex-encoded message to POST /v1/keys/sign', async () => {
      mockResponse(200, { signature: '0xsig', publicKey: '0xpub' });

      const msg = new Uint8Array([0xde, 0xad]);
      const result = await keys.signAction(msg);

      expect(result.signature).toBe('0xsig');
      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1].body as string);
      expect(body.message).toBe('dead');
    });
  });

  describe('revokeKeyPair', () => {
    it('calls POST /v1/keys/revoke with keyId', async () => {
      mockResponse(200, { success: true });

      await keys.revokeKeyPair('k1');

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1].body as string);
      expect(body.keyId).toBe('k1');
    });
  });

  describe('rotateKeyPair', () => {
    it('calls POST /v1/keys/rotate', async () => {
      mockResponse(201, { publicKey: '0xnew', keyId: 'k2' });

      const result = await keys.rotateKeyPair();

      expect(result.publicKey).toBe('0xnew');
    });
  });

  describe('error handling', () => {
    it('throws InvarianceError on non-ok response', async () => {
      mockResponse(500, null);

      await expect(keys.generateKeyPair()).rejects.toThrow('Error');
    });
  });

  describe('URL handling', () => {
    it('handles apiUrl with /v1 prefix', async () => {
      const keysV1 = new KeyManager({
        apiUrl: 'https://api.invariance.dev/v1',
        accessToken: 'test-token',
      });

      mockResponse(200, { publicKey: '0xabc' });
      await keysV1.getPublicKey();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.invariance.dev/v1/keys/public',
        expect.anything(),
      );
    });
  });

  describe('auth headers', () => {
    it('sends Bearer token', async () => {
      mockResponse(200, { publicKey: '0xabc' });

      await keys.getPublicKey();

      const headers = mockFetch.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });
  });
});
