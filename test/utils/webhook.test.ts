import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWebhookSignature } from '../../src/utils/webhook.js';

/** Helper to compute a valid HMAC-SHA256 signature */
function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret_123';

  it('returns true for a valid signature', () => {
    const body = '{"event":"identity.registered"}';
    const sig = sign(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('returns false for a wrong signature', () => {
    const body = '{"event":"identity.registered"}';
    const sig = sign(body, secret);
    const tampered = sig.replace(sig[0], sig[0] === 'a' ? 'b' : 'a');
    expect(verifyWebhookSignature(body, tampered, secret)).toBe(false);
  });

  it('returns false for a signature of wrong length', () => {
    const body = '{"event":"test"}';
    expect(verifyWebhookSignature(body, 'tooshort', secret)).toBe(false);
  });

  it('works with body as string', () => {
    const body = 'plain string body';
    const sig = sign(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('works with body as object (JSON.stringified)', () => {
    const body = { event: 'escrow.funded', data: { id: '123' } };
    const sig = sign(JSON.stringify(body), secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('different secrets produce different results', () => {
    const body = '{"event":"test"}';
    const sig1 = sign(body, 'secret-a');
    const sig2 = sign(body, 'secret-b');
    expect(sig1).not.toBe(sig2);
    expect(verifyWebhookSignature(body, sig1, 'secret-a')).toBe(true);
    expect(verifyWebhookSignature(body, sig1, 'secret-b')).toBe(false);
  });

  it('works with empty string body', () => {
    const body = '';
    const sig = sign(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('tampered body fails verification', () => {
    const body = '{"event":"original"}';
    const sig = sign(body, secret);
    expect(verifyWebhookSignature('{"event":"tampered"}', sig, secret)).toBe(
      false,
    );
  });
});
