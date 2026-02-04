import type {
  ActionInput,
  PolicyCheckResult,
  HumanApprovalPolicy,
  ApprovalTrigger,
  ApprovalChannel,
  ActorType,
  ActionCategory,
} from '@invariance/common';
import { DEFAULT_POLICY_VALUES } from '@invariance/common';
import type { AsyncExecutionPolicy } from './types.js';

/**
 * Represents a pending approval request.
 */
export interface ApprovalRequest {
  /** Unique request identifier */
  id: string;
  /** The action requiring approval */
  action: ActionInput;
  /** Triggers that matched this action */
  matchedTriggers: ApprovalTrigger[];
  /** When the request was created */
  createdAt: number;
  /** When the request expires */
  expiresAt: number;
  /** Current status */
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  /** Reason for rejection (if rejected) */
  rejectionReason?: string;
}

/**
 * Callback for requesting human approval.
 * Should return true if approved, false if rejected.
 */
export type ApprovalRequestCallback = (request: ApprovalRequest) => Promise<boolean>;

/**
 * Custom predicate function for trigger matching.
 */
export type CustomPredicate = (action: ActionInput) => boolean;

/**
 * Options for creating a human approval policy.
 */
export interface HumanApprovalOptions {
  /** Conditions that trigger approval requirement */
  triggers: ApprovalTrigger[];
  /** Timeout in seconds for approval requests */
  timeoutSeconds: number;
  /** Channel for approval responses */
  channel?: ApprovalChannel;
  /** Webhook URL for 'webhook' channel */
  webhookUrl?: string;

  // NEW OPTIONAL FIELDS (v2.0)
  /** Policy version (default: "1.0.0") */
  version?: string;
  /** Max gas per action (default: 5_000_000n) */
  maxGas?: bigint;
  /** Max value per action (default: unlimited) */
  maxValue?: bigint;
  /** Allowed actor types (default: ['any']) */
  allowedActors?: ActorType[];
  /** Action category (default: 'CUSTOM') */
  category?: ActionCategory;
  /** Cooldown between same-category actions in seconds (default: 300) */
  cooldownSeconds?: number;
}

/**
 * Human approval policy - requires human-in-the-loop confirmation.
 * Supports trigger-based activation and multiple approval channels.
 *
 * @example
 * ```typescript
 * const humanApproval = new HumanApproval({
 *   triggers: [
 *     { type: 'amount-threshold', threshold: 1000000000000000000n }, // > 1 ETH
 *     { type: 'action-type', patterns: ['admin:*', 'delete:*'] },
 *   ],
 *   timeoutSeconds: 300, // 5 minutes
 * });
 *
 * humanApproval.onApprovalRequest(async (request) => {
 *   return await showApprovalDialog(request);
 * });
 * ```
 */
export class HumanApproval implements AsyncExecutionPolicy {
  readonly type = 'human-approval';
  readonly requiresAsync = true;

  private readonly triggers: ApprovalTrigger[];
  private readonly timeoutSeconds: number;
  private readonly channel: ApprovalChannel;
  private readonly webhookUrl: string | undefined;
  private readonly policyFields: {
    version: string;
    maxGas: bigint;
    maxValue: bigint;
    allowedActors: ActorType[];
    category: ActionCategory;
    cooldownSeconds: number;
  };
  private active = true;
  private requests: Map<string, ApprovalRequest> = new Map();
  private approvalCallback: ApprovalRequestCallback | null = null;
  private customPredicates: Map<string, CustomPredicate> = new Map();
  private requestCounter = 0;

  constructor(options: HumanApprovalOptions) {
    this.validateOptions(options);
    this.triggers = options.triggers;
    this.timeoutSeconds = options.timeoutSeconds;
    this.channel = options.channel ?? 'callback';
    this.webhookUrl = options.webhookUrl;
    this.policyFields = {
      version: options.version ?? DEFAULT_POLICY_VALUES.version,
      maxGas: options.maxGas ?? DEFAULT_POLICY_VALUES.maxGas,
      maxValue: options.maxValue ?? DEFAULT_POLICY_VALUES.maxValue,
      allowedActors: options.allowedActors ?? DEFAULT_POLICY_VALUES.allowedActors,
      category: options.category ?? DEFAULT_POLICY_VALUES.category,
      cooldownSeconds: options.cooldownSeconds ?? DEFAULT_POLICY_VALUES.cooldownSeconds,
    };
  }

  /**
   * Check if this policy is active.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Enable or disable this policy.
   */
  setActive(active: boolean): void {
    this.active = active;
  }

  /**
   * Register a callback for approval requests.
   * This callback is invoked when checkAsync needs human approval.
   *
   * @param callback - Function to request approval
   */
  onApprovalRequest(callback: ApprovalRequestCallback): void {
    this.approvalCallback = callback;
  }

  /**
   * Register a custom predicate for trigger matching.
   *
   * @param id - Unique predicate identifier
   * @param predicate - Function that returns true if action matches
   */
  registerPredicate(id: string, predicate: CustomPredicate): void {
    this.customPredicates.set(id, predicate);
  }

  /**
   * Synchronous check - returns false if approval is required.
   * Use checkAsync for the full approval flow.
   */
  check(action: ActionInput): PolicyCheckResult {
    if (!this.active) {
      return { allowed: true };
    }

    const matchedTriggers = this.getMatchingTriggers(action);

    // No triggers matched, allow
    if (matchedTriggers.length === 0) {
      return { allowed: true };
    }

    // Sync check: approval required, cannot proceed without async
    return {
      allowed: false,
      reason: 'Action requires human approval. Use checkAsync() for approval flow.',
    };
  }

  /**
   * Asynchronously check policy by requesting human approval.
   *
   * @param action - The action requiring approval
   * @returns Policy check result after approval decision
   */
  async checkAsync(action: ActionInput): Promise<PolicyCheckResult> {
    if (!this.active) {
      return { allowed: true };
    }

    const matchedTriggers = this.getMatchingTriggers(action);

    // No triggers matched, allow
    if (matchedTriggers.length === 0) {
      return { allowed: true };
    }

    // Check for existing approved request
    const existingRequest = this.findApprovedRequest(action);
    if (existingRequest) {
      return { allowed: true };
    }

    // Create new approval request
    const request = this.createRequest(action, matchedTriggers);

    // Request approval based on channel
    const approved = await this.requestApproval(request);

    if (approved) {
      request.status = 'approved';
      return { allowed: true };
    }

    request.status = 'rejected';
    return {
      allowed: false,
      reason: request.rejectionReason ?? 'Human approval denied',
    };
  }

  /**
   * Manually approve a pending request (for poll/webhook channels).
   *
   * @param requestId - The request ID to approve
   */
  approve(requestId: string): void {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request is not pending: ${request.status}`);
    }

    if (Date.now() > request.expiresAt) {
      request.status = 'expired';
      throw new Error('Request has expired');
    }

    request.status = 'approved';
  }

  /**
   * Manually reject a pending request (for poll/webhook channels).
   *
   * @param requestId - The request ID to reject
   * @param reason - Optional reason for rejection
   */
  reject(requestId: string, reason?: string): void {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request is not pending: ${request.status}`);
    }

    request.status = 'rejected';
    if (reason !== undefined) {
      request.rejectionReason = reason;
    }
  }

  /**
   * Get a pending request by ID.
   *
   * @param requestId - The request ID
   * @returns The request or undefined
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Get all pending requests.
   *
   * @returns Array of pending requests
   */
  getPendingRequests(): ApprovalRequest[] {
    const pending: ApprovalRequest[] = [];
    for (const request of this.requests.values()) {
      if (request.status === 'pending' && Date.now() <= request.expiresAt) {
        pending.push(request);
      }
    }
    return pending;
  }

  /**
   * Convert to policy config format.
   */
  toPolicy(): HumanApprovalPolicy {
    const policy: HumanApprovalPolicy = {
      id: `human-approval-${this.channel}`,
      type: 'human-approval',
      active: this.active,
      triggers: this.triggers,
      timeoutSeconds: this.timeoutSeconds,
      channel: this.channel,
      version: this.policyFields.version,
      maxGas: this.policyFields.maxGas,
      maxValue: this.policyFields.maxValue,
      allowedActors: this.policyFields.allowedActors,
      category: this.policyFields.category,
      cooldownSeconds: this.policyFields.cooldownSeconds,
    };

    if (this.webhookUrl !== undefined) {
      policy.webhookUrl = this.webhookUrl;
    }

    return policy;
  }

  /**
   * @deprecated Use toPolicy() instead
   */
  toPermission(): HumanApprovalPolicy {
    return this.toPolicy();
  }

  /**
   * Validate the options.
   */
  private validateOptions(options: HumanApprovalOptions): void {
    if (options.timeoutSeconds <= 0) {
      throw new Error('timeoutSeconds must be positive');
    }

    if (options.triggers.length === 0) {
      throw new Error('At least one trigger is required');
    }

    if (options.channel === 'webhook' && !options.webhookUrl) {
      throw new Error('webhookUrl is required for webhook channel');
    }
  }

  /**
   * Get triggers that match the action.
   */
  private getMatchingTriggers(action: ActionInput): ApprovalTrigger[] {
    return this.triggers.filter((trigger) =>
      this.triggerMatches(trigger, action),
    );
  }

  /**
   * Check if a trigger matches an action.
   */
  private triggerMatches(trigger: ApprovalTrigger, action: ActionInput): boolean {
    switch (trigger.type) {
      case 'always':
        return true;

      case 'action-type':
        return trigger.patterns.some((pattern) => {
          if (pattern.endsWith('*')) {
            return action.type.startsWith(pattern.slice(0, -1));
          }
          return action.type === pattern;
        });

      case 'amount-threshold': {
        const amount = this.extractAmount(action);
        if (amount === null) return false;

        // If token is specified, check that it matches
        if (trigger.token) {
          const actionToken = action.params['token'] as string | undefined;
          if (actionToken && actionToken !== trigger.token) {
            return false;
          }
        }

        return amount >= trigger.threshold;
      }

      case 'custom': {
        const predicate = this.customPredicates.get(trigger.predicateId);
        if (!predicate) {
          console.warn(`Custom predicate not found: ${trigger.predicateId}`);
          return false;
        }
        return predicate(action);
      }
    }
  }

  /**
   * Extract amount from action params.
   */
  private extractAmount(action: ActionInput): bigint | null {
    const params = action.params;
    const amountFields = ['amount', 'value', 'wei', 'quantity'];

    for (const field of amountFields) {
      const value = params[field];

      if (typeof value === 'bigint') {
        return value;
      }

      if (typeof value === 'string' || typeof value === 'number') {
        try {
          return BigInt(value);
        } catch {
          // Not a valid bigint
        }
      }
    }

    return null;
  }

  /**
   * Create a new approval request.
   */
  private createRequest(
    action: ActionInput,
    matchedTriggers: ApprovalTrigger[],
  ): ApprovalRequest {
    const now = Date.now();

    const request: ApprovalRequest = {
      id: `approval-${++this.requestCounter}`,
      action,
      matchedTriggers,
      createdAt: now,
      expiresAt: now + this.timeoutSeconds * 1000,
      status: 'pending',
    };

    this.requests.set(request.id, request);
    return request;
  }

  /**
   * Find an existing approved request for an action.
   */
  private findApprovedRequest(action: ActionInput): ApprovalRequest | undefined {
    for (const request of this.requests.values()) {
      if (
        request.status === 'approved' &&
        request.action.type === action.type &&
        JSON.stringify(request.action.params) === JSON.stringify(action.params) &&
        Date.now() <= request.expiresAt
      ) {
        return request;
      }
    }
    return undefined;
  }

  /**
   * Request approval based on the configured channel.
   */
  private async requestApproval(request: ApprovalRequest): Promise<boolean> {
    switch (this.channel) {
      case 'callback':
        return this.requestViaCallback(request);

      case 'webhook':
        return this.requestViaWebhook(request);

      case 'poll':
        return this.requestViaPoll(request);

      default:
        return false;
    }
  }

  /**
   * Request approval via registered callback.
   */
  private async requestViaCallback(request: ApprovalRequest): Promise<boolean> {
    if (!this.approvalCallback) {
      throw new Error('No approval callback registered. Call onApprovalRequest() first.');
    }

    try {
      return await this.approvalCallback(request);
    } catch (error) {
      request.rejectionReason = `Callback error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return false;
    }
  }

  /**
   * Request approval via webhook.
   */
  private async requestViaWebhook(request: ApprovalRequest): Promise<boolean> {
    if (!this.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: request.id,
          action: request.action,
          matchedTriggers: request.matchedTriggers.map((t) => t.type),
          expiresAt: request.expiresAt,
        }),
      });

      if (!response.ok) {
        request.rejectionReason = `Webhook returned ${response.status}`;
        return false;
      }

      const result = (await response.json()) as { approved?: boolean; reason?: string };
      if (!result.approved) {
        request.rejectionReason = result.reason ?? 'Webhook denied approval';
      }
      return result.approved === true;
    } catch (error) {
      request.rejectionReason = `Webhook error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return false;
    }
  }

  /**
   * Request approval via polling.
   * The request is created and the caller must poll getRequest() and call approve()/reject().
   */
  private async requestViaPoll(request: ApprovalRequest): Promise<boolean> {
    // Wait for the request to be approved/rejected or expire
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() < request.expiresAt) {
      if (request.status === 'approved') {
        return true;
      }
      if (request.status === 'rejected') {
        return false;
      }

      // Check if we've been waiting too long
      if (Date.now() - startTime > this.timeoutSeconds * 1000) {
        request.status = 'expired';
        request.rejectionReason = 'Request timed out';
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    request.status = 'expired';
    request.rejectionReason = 'Request expired';
    return false;
  }
}
