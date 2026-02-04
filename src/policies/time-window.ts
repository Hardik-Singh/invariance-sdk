import type {
  ActionInput,
  PolicyCheckResult,
  TimeWindowPolicy,
  ActorType,
  ActionCategory,
} from '@invariance/common';
import { DEFAULT_POLICY_VALUES } from '@invariance/common';
import type { ExecutionPolicy } from './types.js';

/**
 * Options for creating a time window policy.
 */
export interface TimeWindowOptions {
  /** Start hour in UTC (0-23) */
  startHour: number;
  /** End hour in UTC (0-23) */
  endHour: number;
  /** Days of week allowed (0 = Sunday, 6 = Saturday). Defaults to all days. */
  allowedDays?: number[];

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
 * Time window policy - restricts action execution to specific hours and days.
 *
 * @example
 * ```typescript
 * // Allow only during business hours (9 AM - 5 PM UTC, Monday-Friday)
 * const timeWindow = new TimeWindow({
 *   startHour: 9,
 *   endHour: 17,
 *   allowedDays: [1, 2, 3, 4, 5], // Mon-Fri
 * });
 * ```
 */
export class TimeWindow implements ExecutionPolicy {
  readonly type = 'time-window';
  private readonly options: Required<
    Pick<TimeWindowOptions, 'startHour' | 'endHour' | 'allowedDays' | 'version' | 'maxGas' | 'maxValue' | 'allowedActors' | 'category' | 'cooldownSeconds'>
  >;
  private active = true;

  constructor(options: TimeWindowOptions) {
    // Validate hours
    if (options.startHour < 0 || options.startHour > 23) {
      throw new Error('startHour must be between 0 and 23');
    }
    if (options.endHour < 0 || options.endHour > 23) {
      throw new Error('endHour must be between 0 and 23');
    }

    // Validate days
    const allowedDays = options.allowedDays ?? [0, 1, 2, 3, 4, 5, 6];
    for (const day of allowedDays) {
      if (day < 0 || day > 6) {
        throw new Error('allowedDays must contain values between 0 and 6');
      }
    }

    this.options = {
      startHour: options.startHour,
      endHour: options.endHour,
      allowedDays,
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
   * Check if an action is within the allowed time window.
   */
  check(_action: ActionInput): PolicyCheckResult {
    if (!this.active) {
      return { allowed: true };
    }

    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();

    // Check day of week
    if (!this.options.allowedDays.includes(day)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        allowed: false,
        reason: `Actions not allowed on ${dayNames[day] ?? 'Unknown'}`,
      };
    }

    // Check hour
    const { startHour, endHour } = this.options;
    if (startHour < endHour) {
      // Normal range (e.g., 9-17)
      if (hour < startHour || hour >= endHour) {
        return {
          allowed: false,
          reason: `Actions only allowed between ${startHour}:00 and ${endHour}:00 UTC (current: ${hour}:00)`,
        };
      }
    } else {
      // Overnight range (e.g., 22-6)
      if (hour < startHour && hour >= endHour) {
        return {
          allowed: false,
          reason: `Actions only allowed between ${startHour}:00 and ${endHour}:00 UTC (current: ${hour}:00)`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Convert to policy config format.
   */
  toPolicy(): TimeWindowPolicy {
    return {
      id: `time-window-${this.options.startHour}-${this.options.endHour}`,
      type: 'time-window',
      active: this.active,
      startHour: this.options.startHour,
      endHour: this.options.endHour,
      allowedDays: this.options.allowedDays,
      version: this.options.version,
      maxGas: this.options.maxGas,
      maxValue: this.options.maxValue,
      allowedActors: this.options.allowedActors,
      category: this.options.category,
      cooldownSeconds: this.options.cooldownSeconds,
    };
  }

  /**
   * @deprecated Use toPolicy() instead
   */
  toPermission(): TimeWindowPolicy {
    return this.toPolicy();
  }
}
