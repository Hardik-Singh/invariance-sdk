/**
 * Re-exports and module-specific types for the Webhooks module.
 */
export type {
  RegisterWebhookOptions,
  Webhook,
  WebhookEvent,
  WebhookPayload,
  DeliveryLog,
} from '@invariance/common';

/** Options for updating a webhook */
export interface UpdateWebhookOptions {
  url?: string;
  events?: import('@invariance/common').WebhookEvent[];
  filters?: {
    identities?: string[];
    actorTypes?: import('@invariance/common').ActorType[];
    actions?: string[];
  };
  metadata?: Record<string, string>;
}

/** Options for querying webhook delivery logs */
export interface WebhookLogOptions {
  limit?: number;
  offset?: number;
  onlyFailed?: boolean;
}
