import { createHmac } from 'crypto';

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
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= (expected.charCodeAt(i) ?? 0) ^ (signature.charCodeAt(i) ?? 0);
  }

  return result === 0;
}
