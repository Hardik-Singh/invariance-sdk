import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify an Invariance webhook HMAC-SHA256 signature.
 *
 * Use this in your webhook endpoint to verify that incoming
 * payloads are genuinely from Invariance and have not been tampered with.
 *
 * @param body - The raw request body (string or object)
 * @param signature - The signature from the `X-Invariance-Signature` header
 * @param secret - Your webhook secret (from webhook registration)
 * @returns True if the signature is valid
 *
 * @example
 * ```typescript
 * import { verifyWebhookSignature } from '@invariance/sdk';
 *
 * app.post('/webhooks/invariance', (req, res) => {
 *   const sig = req.headers['x-invariance-signature'];
 *   if (!verifyWebhookSignature(req.body, sig, WEBHOOK_SECRET)) {
 *     return res.status(401).send('Invalid signature');
 *   }
 *   // Process webhook...
 * });
 * ```
 */
export function verifyWebhookSignature(
  body: unknown,
  signature: string,
  secret: string,
): boolean {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const expected = createHmac('sha256', secret).update(payload).digest();
  const signatureBuffer = Buffer.from(signature, 'hex');

  // Use timing-safe comparison on fixed-length buffers
  if (expected.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expected, signatureBuffer);
}
