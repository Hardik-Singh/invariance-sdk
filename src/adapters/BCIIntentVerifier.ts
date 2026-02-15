/**
 * Dual-identity verification (device + human) with confidence thresholds.
 * Serves: Neuralink, Merge Labs, and future BCI platforms.
 *
 * @example
 * ```typescript
 * const bci = new BCIIntentVerifier(inv, { autoApprove: 0.95, humanReview: 0.7, deny: 0.3 });
 * const result = await bci.verifyIntent({
 *   deviceId: 'device-neuralink-001',
 *   humanId: 'identity-user-123',
 *   confidence: 0.92,
 *   action: 'transfer',
 *   params: { to: '0xRecipient', amount: '100' },
 * });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';

/** BCI signal with confidence score */
export interface BCISignal {
  /** Device identity ID */
  deviceId: string;
  /** Human identity ID */
  humanId: string;
  /** Neural confidence score (0.0 - 1.0) */
  confidence: number;
  /** Intended action */
  action: string;
  /** Action parameters */
  params: Record<string, unknown>;
  /** Raw signal metadata */
  signalMetadata?: Record<string, unknown>;
}

/** Confidence threshold configuration */
export interface ConfidenceThresholds {
  /** Minimum confidence for auto-approval (default: 0.95) */
  autoApprove: number;
  /** Minimum confidence for human-in-the-loop approval (default: 0.7) */
  humanReview: number;
  /** Below this, action is denied (default: 0.3) */
  deny: number;
}

/** BCI verification result */
export interface BCIVerificationResult {
  /** Whether the action is approved */
  approved: boolean;
  /** Approval method used */
  method: 'auto' | 'human-review' | 'denied';
  /** Confidence score */
  confidence: number;
  /** Reason for decision */
  reason: string;
  /** Ledger entry for audit trail */
  auditEntryId?: string;
  /** Transaction hash */
  txHash?: string;
}

/**
 * BCIIntentVerifier — dual-identity verification for brain-computer interfaces.
 */
export class BCIIntentVerifier {
  private readonly client: Invariance;
  private readonly thresholds: ConfidenceThresholds;
  private readonly highStakesActions: Set<string>;

  constructor(
    client: Invariance,
    thresholds?: Partial<ConfidenceThresholds>,
    highStakesActions?: string[],
  ) {
    this.client = client;
    this.thresholds = {
      autoApprove: thresholds?.autoApprove ?? 0.95,
      humanReview: thresholds?.humanReview ?? 0.7,
      deny: thresholds?.deny ?? 0.3,
    };
    this.highStakesActions = new Set(highStakesActions ?? [
      'transfer-large',
      'delete-account',
      'grant-access',
      'revoke-all',
    ]);
  }

  /**
   * Verify a BCI intent signal with dual-identity check and confidence gating.
   */
  async verifyIntent(signal: BCISignal): Promise<BCIVerificationResult> {
    const { confidence, action } = signal;

    // Validate both identities exist
    const [device, human] = await Promise.all([
      this.client.identity.get(signal.deviceId),
      this.client.identity.get(signal.humanId),
    ]);

    if (!device || !human) {
      return {
        approved: false,
        method: 'denied',
        confidence,
        reason: `Identity not found: ${!device ? signal.deviceId : signal.humanId}`,
      };
    }

    let method: BCIVerificationResult['method'];
    let approved: boolean;
    let reason: string;

    if (confidence < this.thresholds.deny) {
      method = 'denied';
      approved = false;
      reason = `Confidence ${confidence} below deny threshold ${this.thresholds.deny}`;
    } else if (this.highStakesActions.has(action) || confidence < this.thresholds.autoApprove) {
      method = 'human-review';
      approved = confidence >= this.thresholds.humanReview;
      reason = this.highStakesActions.has(action)
        ? `High-stakes action '${action}' requires human review (confidence: ${confidence})`
        : `Confidence ${confidence} requires human review (threshold: ${this.thresholds.autoApprove})`;
    } else {
      method = 'auto';
      approved = true;
      reason = `Confidence ${confidence} meets auto-approve threshold ${this.thresholds.autoApprove}`;
    }

    // Log to immutable audit trail
    const entry = await this.client.ledger.log({
      action: 'bci-intent-verification',
      actor: { type: 'device' as const, address: device.address },
      category: 'custom',
      metadata: {
        humanId: signal.humanId,
        deviceId: signal.deviceId,
        confidence,
        intendedAction: action,
        method,
        approved,
        reason,
        signalMetadata: signal.signalMetadata,
      },
    });

    return {
      approved,
      method,
      confidence,
      reason,
      auditEntryId: entry.entryId,
      txHash: entry.txHash,
    };
  }

  /**
   * Update confidence thresholds.
   */
  setThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    Object.assign(this.thresholds, thresholds);
  }

  /**
   * Add actions to the high-stakes list.
   */
  addHighStakesActions(actions: string[]): void {
    for (const action of actions) {
      this.highStakesActions.add(action);
    }
  }

  /**
   * Get current threshold configuration.
   */
  getThresholds(): ConfidenceThresholds {
    return { ...this.thresholds };
  }
}
