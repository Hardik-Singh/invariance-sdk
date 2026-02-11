/**
 * SDK-level event types that modules can emit.
 */
export interface InvarianceEvents {
  'identity.registered': { identityId: string; address: string };
  'identity.paused': { identityId: string };
  'identity.resumed': { identityId: string };
  'intent.requested': { intentId: string; action: string };
  'intent.completed': { intentId: string; txHash: string };
  'intent.rejected': { intentId: string; reason: string };
  'policy.created': { policyId: string; name: string };
  'policy.attached': { policyId: string; identityId: string };
  'policy.detached': { policyId: string; identityId: string };
  'policy.revoked': { policyId: string };
  'policy.composed': { policyId: string; name: string };
  'policy.violation': { policyId: string; action: string; detail: string };
  'escrow.created': { escrowId: string; amount: string };
  'escrow.funded': { escrowId: string };
  'escrow.released': { escrowId: string };
  'escrow.disputed': { escrowId: string; reason: string };
  'ledger.logged': { entryId: string; action: string };
  'reputation.reviewed': { reviewId: string; target: string; rating: number };
  'marketplace.listed': { listingId: string };
  'marketplace.hired': { hireId: string; listingId: string };
  'webhook.delivered': { webhookId: string; event: string };
  'payment.completed': { paymentId: string; action: string; amount: string };
  'payment.failed': { action: string; reason: string };
  'erc8004.identity.linked': { invarianceIdentityId: string; erc8004AgentId: string };
  'erc8004.identity.unlinked': { invarianceIdentityId: string; erc8004AgentId: string };
  'erc8004.feedback.pushed': { erc8004AgentId: string; value: number };
  'erc8004.validation.responded': { requestHash: string; response: number };
  'error': { code: string; message: string };
}

/** Listener callback type */
type Listener<T> = (data: T) => void;

/**
 * Typed event emitter for SDK-level events.
 *
 * Provides a simple pub/sub mechanism for all Invariance modules
 * to emit events and for consumers to subscribe to them.
 *
 * @example
 * ```typescript
 * const emitter = new InvarianceEventEmitter();
 * emitter.on('intent.completed', (data) => {
 *   console.log(`Intent ${data.intentId} completed: ${data.txHash}`);
 * });
 * ```
 */
export class InvarianceEventEmitter {
  private listeners: Map<string, Set<Listener<unknown>>> = new Map();

  /**
   * Subscribe to an event.
   *
   * @param event - The event name to listen for
   * @param listener - Callback invoked when the event is emitted
   * @returns A function to unsubscribe
   */
  on<K extends keyof InvarianceEvents>(
    event: K,
    listener: Listener<InvarianceEvents[K]>,
  ): () => void {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const set = this.listeners.get(key)!;
    set.add(listener as Listener<unknown>);

    return () => {
      set.delete(listener as Listener<unknown>);
    };
  }

  /**
   * Unsubscribe from an event.
   *
   * @param event - The event name
   * @param listener - The callback to remove
   */
  off<K extends keyof InvarianceEvents>(
    event: K,
    listener: Listener<InvarianceEvents[K]>,
  ): void {
    const set = this.listeners.get(event as string);
    if (set) {
      set.delete(listener as Listener<unknown>);
    }
  }

  /**
   * Emit an event to all subscribers.
   *
   * @param event - The event name
   * @param data - The event payload
   */
  emit<K extends keyof InvarianceEvents>(
    event: K,
    data: InvarianceEvents[K],
  ): void {
    const set = this.listeners.get(event as string);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (_err) {
          // Swallow listener errors to avoid breaking emitters
        }
      }
    }
  }
}
