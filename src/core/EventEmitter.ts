/**
 * SDK-level event types that modules can emit.
 */
export interface InvarianceEvents {
  'identity.registered': { identityId: string; address: string };
  'identity.paused': { identityId: string };
  'identity.resumed': { identityId: string };
  'intent.requested': { intentId: string; action: string; requester?: string; requesterIdentityId?: string; target?: string; value?: string; mode?: string };
  'intent.approved': { intentId: string; approver: string; approverIdentityId: string };
  'intent.completed': { intentId: string; txHash: string; requester?: string; requesterIdentityId?: string; action?: string; value?: string };
  'intent.rejected': { intentId: string; reason: string; rejector?: string; rejectorIdentityId?: string };
  'policy.created': { policyId: string; name: string };
  'policy.attached': { policyId: string; identityId: string };
  'policy.detached': { policyId: string; identityId: string };
  'policy.revoked': { policyId: string };
  'policy.composed': { policyId: string; name: string };
  'policy.violation': { policyId: string; action: string; detail: string };
  'escrow.created': { escrowId: string; amount: string; depositor?: string; depositorIdentityId?: string; beneficiary?: string; beneficiaryIdentityId?: string; conditionType?: string };
  'escrow.funded': { escrowId: string; funder?: string; depositor?: string; depositorIdentityId?: string; beneficiary?: string; beneficiaryIdentityId?: string; amount?: string };
  'escrow.released': { escrowId: string; depositor?: string; depositorIdentityId?: string; beneficiary?: string; beneficiaryIdentityId?: string; amount?: string };
  'escrow.refunded': { escrowId: string; depositor?: string; depositorIdentityId?: string; beneficiary?: string; beneficiaryIdentityId?: string; amount?: string };
  'escrow.disputed': { escrowId: string; reason: string; disputant?: string; depositor?: string; depositorIdentityId?: string; beneficiary?: string; beneficiaryIdentityId?: string; amount?: string };
  'escrow.resolved': { escrowId: string; depositor?: string; depositorIdentityId?: string; beneficiary?: string; beneficiaryIdentityId?: string; transferAmount?: string; releasedToBeneficiary?: boolean };
  'ledger.logged': { entryId: string; action: string };
  'reputation.reviewed': { reviewId: string; target: string; rating: number; reviewer?: string; reviewerIdentityId?: string; targetIdentityId?: string; escrowId?: string; commentHash?: string; categories?: Record<string, number> };
  'marketplace.listed': { listingId: string };
  'marketplace.hired': { hireId: string; listingId: string; hirer?: string; provider?: string; escrowId?: string; policyId?: string };
  'marketplace.hire.completed': { hireId: string; hirer: string; provider: string; listingId: string; escrowId: string; completedAt: number };
  'marketplace.hire.cancelled': { hireId: string; hirer: string; provider: string; listingId: string; escrowId: string };
  'marketplace.hire.disputed': { hireId: string; disputant: string; hirer: string; provider: string; listingId: string; escrowId: string };
  'webhook.delivered': { webhookId: string; event: string };
  'payment.completed': { paymentId: string; action: string; amount: string };
  'payment.failed': { action: string; reason: string };
  'erc8004.identity.linked': { invarianceIdentityId: string; erc8004AgentId: string };
  'erc8004.identity.unlinked': { invarianceIdentityId: string; erc8004AgentId: string };
  'erc8004.feedback.pushed': { erc8004AgentId: string; value: number };
  'erc8004.validation.responded': { requestHash: string; response: number };
  'action.before': { action: string; actor: { type: string; address: string }; timestamp: number };
  'action.after': { action: string; actor: { type: string; address: string }; durationMs: number; success: boolean; timestamp: number };
  'action.violation': { action: string; detail: string; policyId?: string; timestamp: number };
  'action.error': { action: string; message: string; code?: string; timestamp: number };
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
      if (set.size === 0) {
        this.listeners.delete(key);
      }
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
      if (set.size === 0) {
        this.listeners.delete(event as string);
      }
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
        } catch (err) {
          // Re-emit listener errors as 'error' event so consumers can observe failures
          if (event !== 'error') {
            const hasErrorListeners = (this.listeners.get('error')?.size ?? 0) > 0;
            if (hasErrorListeners) {
              try {
                this.emit('error', {
                  code: 'LISTENER_ERROR',
                  message: err instanceof Error ? err.message : String(err),
                });
              } catch (errorErr) {
                // Prevent recursion if error listener itself throws
                console.warn('[Invariance] Error listener threw:', errorErr instanceof Error ? errorErr.message : String(errorErr));
              }
            } else {
              // No error listeners registered — log to console so errors aren't silently lost
              console.error(`[Invariance] Unhandled listener error on "${event as string}":`, err instanceof Error ? err.message : String(err));
            }
          }
        }
      }
    }
  }
}
