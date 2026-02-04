import type {
  ActionInput,
  PermissionConfig,
  PermissionCheckResult,
  AnyPermission,
} from '@invariance/common';

/**
 * Verifies actions against permission rules.
 */
export class Verifier {
  private readonly config: PermissionConfig | undefined;

  constructor(config?: PermissionConfig) {
    this.config = config;
  }

  /**
   * Check if an action is permitted based on the configured permissions.
   *
   * @param action - The action to check
   * @returns The result of the permission check
   */
  checkPermission(action: ActionInput): PermissionCheckResult {
    // No permissions configured = allow by default
    if (!this.config) {
      return { allowed: true };
    }

    // Check each permission
    for (const permission of this.config.permissions) {
      if (!permission.active) continue;

      const result = this.checkSinglePermission(permission, action);
      if (!result.allowed) {
        return result;
      }
    }

    // All permissions passed
    return { allowed: true };
  }

  /**
   * Check a single permission rule.
   */
  private checkSinglePermission(
    permission: AnyPermission,
    action: ActionInput,
  ): PermissionCheckResult {
    switch (permission.type) {
      case 'spending-cap':
        return this.checkSpendingCap(permission, action);
      case 'time-window':
        return this.checkTimeWindow(permission);
      case 'action-whitelist':
        return this.checkActionWhitelist(permission, action);
      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = permission;
        return { allowed: true };
      }
    }
  }

  /**
   * Check spending cap permission.
   */
  private checkSpendingCap(
    permission: { maxPerTx: bigint; maxPerDay: bigint; token: string },
    action: ActionInput,
  ): PermissionCheckResult {
    // TODO(high): @agent Implement spending cap check
    // Context: Need to parse action params for amount, check against limits
    // AC: Return denied if amount exceeds maxPerTx or daily total exceeds maxPerDay
    return { allowed: true };
  }

  /**
   * Check time window permission.
   */
  private checkTimeWindow(permission: {
    startHour: number;
    endHour: number;
    allowedDays: number[];
  }): PermissionCheckResult {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();

    // Check day of week
    if (!permission.allowedDays.includes(day)) {
      return {
        allowed: false,
        reason: `Action not allowed on this day of week (${day})`,
      };
    }

    // Check hour
    if (hour < permission.startHour || hour >= permission.endHour) {
      return {
        allowed: false,
        reason: `Action not allowed at this hour (${hour} UTC)`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check action whitelist permission.
   */
  private checkActionWhitelist(
    permission: { allowedActions: string[] },
    action: ActionInput,
  ): PermissionCheckResult {
    const isAllowed = permission.allowedActions.some((pattern) => {
      // Support wildcard matching
      if (pattern.endsWith('*')) {
        return action.type.startsWith(pattern.slice(0, -1));
      }
      return action.type === pattern;
    });

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Action type "${action.type}" is not in whitelist`,
      };
    }

    return { allowed: true };
  }
}
