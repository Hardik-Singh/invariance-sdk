import type {
  ActionInput,
  PolicyCheckResult,
  ActionWhitelistPolicy,
  ActorType,
  ActionCategory,
} from '@invariance/common';
import { DEFAULT_POLICY_VALUES } from '@invariance/common';
import type { ExecutionPolicy } from './types.js';

/**
 * Options for creating an action whitelist policy.
 */
export interface ActionWhitelistOptions {
  /** List of allowed action types. Supports wildcard (*) at the end. */
  allowedActions: string[];

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
 * Action whitelist policy - only allows specific action types.
 *
 * @example
 * ```typescript
 * // Only allow transfer and read actions
 * const whitelist = new ActionWhitelist({
 *   allowedActions: [
 *     'transfer',
 *     'read:*',  // Allows read:balance, read:history, etc.
 *   ],
 * });
 * ```
 */
export class ActionWhitelist implements ExecutionPolicy {
  readonly type = 'action-whitelist';
  private readonly allowedActions: string[];
  private readonly policyFields: {
    version: string;
    maxGas: bigint;
    maxValue: bigint;
    allowedActors: ActorType[];
    category: ActionCategory;
    cooldownSeconds: number;
  };
  private active = true;

  constructor(options: ActionWhitelistOptions) {
    if (options.allowedActions.length === 0) {
      throw new Error('allowedActions must not be empty');
    }
    this.allowedActions = [...options.allowedActions];
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
   * Check if an action type is in the whitelist.
   */
  check(action: ActionInput): PolicyCheckResult {
    if (!this.active) {
      return { allowed: true };
    }

    const isAllowed = this.allowedActions.some((pattern) => {
      return this.matchPattern(pattern, action.type);
    });

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Action type "${action.type}" is not whitelisted`,
      };
    }

    return { allowed: true };
  }

  /**
   * Add an action type to the whitelist.
   */
  addAction(action: string): void {
    if (!this.allowedActions.includes(action)) {
      this.allowedActions.push(action);
    }
  }

  /**
   * Remove an action type from the whitelist.
   */
  removeAction(action: string): void {
    const index = this.allowedActions.indexOf(action);
    if (index !== -1) {
      this.allowedActions.splice(index, 1);
    }
  }

  /**
   * Get the list of allowed actions.
   */
  getAllowedActions(): readonly string[] {
    return this.allowedActions;
  }

  /**
   * Convert to policy config format.
   */
  toPolicy(): ActionWhitelistPolicy {
    return {
      id: `action-whitelist-${this.allowedActions.length}`,
      type: 'action-whitelist',
      active: this.active,
      allowedActions: [...this.allowedActions],
      version: this.policyFields.version,
      maxGas: this.policyFields.maxGas,
      maxValue: this.policyFields.maxValue,
      allowedActors: this.policyFields.allowedActors,
      category: this.policyFields.category,
      cooldownSeconds: this.policyFields.cooldownSeconds,
    };
  }

  /**
   * @deprecated Use toPolicy() instead
   */
  toPermission(): ActionWhitelistPolicy {
    return this.toPolicy();
  }

  /**
   * Match an action type against a pattern.
   * Supports:
   * - Exact match: "transfer" matches "transfer"
   * - Wildcard suffix: "read:*" matches "read:balance", "read:history"
   * - Wildcard only: "*" matches everything
   */
  private matchPattern(pattern: string, actionType: string): boolean {
    // Exact match
    if (pattern === actionType) {
      return true;
    }

    // Wildcard only
    if (pattern === '*') {
      return true;
    }

    // Wildcard suffix
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return actionType.startsWith(prefix);
    }

    return false;
  }
}
