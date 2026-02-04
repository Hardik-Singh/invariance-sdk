import type { ActionInput, PermissionCheckResult, ActionWhitelistPermission } from '@invariance/common';
import type { PermissionTemplate } from './types.js';

/**
 * Options for creating an action whitelist permission.
 */
export interface ActionWhitelistOptions {
  /** List of allowed action types. Supports wildcard (*) at the end. */
  allowedActions: string[];
}

/**
 * Action whitelist permission - only allows specific action types.
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
export class ActionWhitelist implements PermissionTemplate {
  readonly type = 'action-whitelist';
  private readonly options: ActionWhitelistOptions;
  private active = true;

  constructor(options: ActionWhitelistOptions) {
    if (options.allowedActions.length === 0) {
      throw new Error('allowedActions must not be empty');
    }
    this.options = options;
  }

  /**
   * Check if this permission is active.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Enable or disable this permission.
   */
  setActive(active: boolean): void {
    this.active = active;
  }

  /**
   * Check if an action type is in the whitelist.
   */
  check(action: ActionInput): PermissionCheckResult {
    if (!this.active) {
      return { allowed: true };
    }

    const isAllowed = this.options.allowedActions.some((pattern) => {
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
    if (!this.options.allowedActions.includes(action)) {
      this.options.allowedActions.push(action);
    }
  }

  /**
   * Remove an action type from the whitelist.
   */
  removeAction(action: string): void {
    const index = this.options.allowedActions.indexOf(action);
    if (index !== -1) {
      this.options.allowedActions.splice(index, 1);
    }
  }

  /**
   * Get the list of allowed actions.
   */
  getAllowedActions(): readonly string[] {
    return this.options.allowedActions;
  }

  /**
   * Convert to permission config format.
   */
  toPermission(): ActionWhitelistPermission {
    return {
      id: `action-whitelist-${this.options.allowedActions.length}`,
      type: 'action-whitelist',
      active: this.active,
      allowedActions: [...this.options.allowedActions],
    };
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
