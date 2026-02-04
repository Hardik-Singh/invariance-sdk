import type {
  ActionInput,
  PermissionConfig,
  PermissionCheckResult,
  AnyPermission,
  SpendingCapPermission,
  VotingPermission,
  HumanApprovalPermission,
} from '@invariance/common';

/**
 * Tracks daily spending for a specific token.
 */
interface DailySpendingEntry {
  /** Total amount spent today */
  amount: bigint;
  /** Date string (YYYY-MM-DD) for this entry */
  date: string;
}

/**
 * Verifies actions against permission rules.
 */
export class Verifier {
  private readonly config: PermissionConfig | undefined;
  /** Tracks daily spending per token address */
  private dailySpending: Map<string, DailySpendingEntry> = new Map();

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
      case 'voting':
        return this.checkVoting(permission, action);
      case 'human-approval':
        return this.checkHumanApproval(permission, action);
      default: {
        // TypeScript exhaustiveness check - ensures all permission types are handled
        permission satisfies never;
        return { allowed: true };
      }
    }
  }

  /**
   * Check spending cap permission.
   *
   * @param permission - The spending cap permission to check against
   * @param action - The action being verified
   * @returns Permission check result
   */
  private checkSpendingCap(
    permission: SpendingCapPermission,
    action: ActionInput,
  ): PermissionCheckResult {
    const amount = this.extractAmount(action);

    // No amount in action params, allow by default
    if (amount === null) {
      return { allowed: true };
    }

    // Check per-transaction limit
    if (amount > permission.maxPerTx) {
      return {
        allowed: false,
        deniedBy: permission,
        reason: `Amount ${amount} exceeds per-transaction limit of ${permission.maxPerTx}`,
      };
    }

    // Check daily limit
    const today = new Date().toISOString().split('T')[0] ?? '';
    const dailyKey = `${permission.token}-${today}`;
    const currentEntry = this.dailySpending.get(dailyKey);

    // Reset if it's a new day or first check for this token
    const currentAmount = currentEntry?.date === today ? currentEntry.amount : 0n;

    if (currentAmount + amount > permission.maxPerDay) {
      return {
        allowed: false,
        deniedBy: permission,
        reason: `Daily spending would exceed limit: current ${currentAmount} + ${amount} > ${permission.maxPerDay}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record spending after a successful action execution.
   * Call this after the action has been executed to track daily totals.
   *
   * @param token - The token address (or '0x0...' for native ETH)
   * @param amount - The amount spent
   */
  recordSpending(token: string, amount: bigint): void {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const dailyKey = `${token}-${today}`;
    const currentEntry = this.dailySpending.get(dailyKey);

    const currentAmount = currentEntry?.date === today ? currentEntry.amount : 0n;
    this.dailySpending.set(dailyKey, {
      amount: currentAmount + amount,
      date: today,
    });
  }

  /**
   * Get the current daily spending for a token.
   *
   * @param token - The token address
   * @returns The amount spent today for this token
   */
  getDailySpending(token: string): bigint {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const dailyKey = `${token}-${today}`;
    const entry = this.dailySpending.get(dailyKey);

    return entry?.date === today ? entry.amount : 0n;
  }

  /**
   * Extract amount from action params.
   * Looks for common amount field names: amount, value, wei, quantity.
   *
   * @param action - The action to extract amount from
   * @returns The amount as bigint, or null if not found
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
          // Not a valid bigint, continue to next field
        }
      }
    }

    return null;
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

  /**
   * Check voting permission.
   * Sync check always returns false for voting permissions - use async templates.
   *
   * @param permission - The voting permission configuration
   * @param action - The action to check
   * @returns Permission check result (always denied for sync check)
   */
  private checkVoting(
    permission: VotingPermission,
    action: ActionInput,
  ): PermissionCheckResult {
    // Check if this action type requires voting
    const requiredFor = permission.requiredForActions;

    // Empty array = all actions require voting
    if (requiredFor.length === 0) {
      return {
        allowed: false,
        deniedBy: permission,
        reason: 'Action requires voting approval. Use Voting permission template for async flow.',
      };
    }

    const requiresVoting = requiredFor.some((pattern) => {
      if (pattern.endsWith('*')) {
        return action.type.startsWith(pattern.slice(0, -1));
      }
      return action.type === pattern;
    });

    if (requiresVoting) {
      return {
        allowed: false,
        deniedBy: permission,
        reason: 'Action requires voting approval. Use Voting permission template for async flow.',
      };
    }

    return { allowed: true };
  }

  /**
   * Check human approval permission.
   * Sync check always returns false for approval permissions - use async templates.
   *
   * @param permission - The human approval permission configuration
   * @param action - The action to check
   * @returns Permission check result (always denied for sync check if triggers match)
   */
  private checkHumanApproval(
    permission: HumanApprovalPermission,
    action: ActionInput,
  ): PermissionCheckResult {
    // Check if any trigger matches
    for (const trigger of permission.triggers) {
      if (this.triggerMatches(trigger, action)) {
        return {
          allowed: false,
          deniedBy: permission,
          reason: 'Action requires human approval. Use HumanApproval permission template for async flow.',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if a trigger matches an action.
   */
  private triggerMatches(
    trigger: HumanApprovalPermission['triggers'][number],
    action: ActionInput,
  ): boolean {
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

      case 'custom':
        // Custom predicates require the async template
        return true;
    }
  }
}
