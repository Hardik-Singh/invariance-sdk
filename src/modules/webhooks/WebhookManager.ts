import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type {
  RegisterWebhookOptions,
  Webhook,
  WebhookPayload,
  DeliveryLog,
  UpdateWebhookOptions,
  WebhookLogOptions,
} from './types.js';

/**
 * Server-side event notifications via webhooks.
 *
 * Register webhook endpoints to receive real-time notifications
 * for policy violations, escrow state changes, intent completions,
 * reputation changes, and more.
 *
 * @example
 * ```typescript
 * const webhook = await inv.webhooks.register({
 *   url: 'https://myapp.com/webhooks/invariance',
 *   events: ['escrow.released', 'policy.violation'],
 *   secret: 'whsec_xxx',
 * });
 * ```
 */
export class WebhookManager {
  private readonly telemetry: Telemetry;

  constructor(
    _contracts: ContractFactory,
    _events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.telemetry = telemetry;
  }

  /**
   * Register a new webhook endpoint.
   *
   * The webhook will receive HMAC-SHA256 signed payloads for
   * the specified events. Use `verifyWebhookSignature()` to
   * validate incoming payloads.
   *
   * @param opts - Webhook registration options
   * @returns The registered webhook with generated secret
   */
  async register(opts: RegisterWebhookOptions): Promise<Webhook> {
    this.telemetry.track('webhooks.register', { eventCount: opts.events.length });

    // TODO: Register webhook via Invariance API
    // 1. Validate URL is reachable
    // 2. Generate secret if not provided
    // 3. Store webhook configuration
    // 4. Return webhook with secret
    throw new InvarianceError(
      ErrorCode.NETWORK_ERROR,
      'Webhook registration requires managed hosting (apiKey). Not yet implemented.',
    );
  }

  /**
   * Update a webhook's configuration.
   *
   * @param webhookId - The webhook to update
   * @param opts - Fields to update
   * @returns The updated webhook
   */
  async update(webhookId: string, _opts: UpdateWebhookOptions): Promise<Webhook> {
    this.telemetry.track('webhooks.update');

    // TODO: Update webhook via API
    throw new InvarianceError(
      ErrorCode.NETWORK_ERROR,
      `Webhook not found: ${webhookId}`,
    );
  }

  /**
   * Delete a webhook.
   *
   * @param webhookId - The webhook to delete
   */
  async delete(webhookId: string): Promise<void> {
    this.telemetry.track('webhooks.delete');

    // TODO: Delete webhook via API
    throw new InvarianceError(
      ErrorCode.NETWORK_ERROR,
      `Webhook not found: ${webhookId}`,
    );
  }

  /**
   * List all registered webhooks.
   *
   * @returns Array of registered webhooks
   */
  async list(): Promise<Webhook[]> {
    this.telemetry.track('webhooks.list');

    // TODO: Fetch webhooks from API
    return [];
  }

  /**
   * Send a test payload to a webhook endpoint.
   *
   * Useful for verifying that your endpoint is correctly configured
   * and can process Invariance webhook payloads.
   *
   * @param webhookId - The webhook to test
   * @returns The test payload that was sent
   */
  async test(webhookId: string): Promise<WebhookPayload> {
    this.telemetry.track('webhooks.test');

    // TODO: Send test payload via API
    throw new InvarianceError(
      ErrorCode.NETWORK_ERROR,
      `Webhook not found: ${webhookId}`,
    );
  }

  /**
   * Get delivery logs for a webhook.
   *
   * Shows recent delivery attempts with status codes,
   * retry counts, and failure details.
   *
   * @param webhookId - The webhook to get logs for
   * @param opts - Optional query options
   * @returns Array of delivery log entries
   */
  async logs(_webhookId: string, _opts?: WebhookLogOptions): Promise<DeliveryLog[]> {
    this.telemetry.track('webhooks.logs');

    // TODO: Fetch delivery logs from API
    return [];
  }
}
