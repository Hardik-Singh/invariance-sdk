import type { ActionInput, PermissionCheckResult, TimeWindowPermission } from '@invariance/common';
import type { PermissionTemplate } from './types.js';

/**
 * Options for creating a time window permission.
 */
export interface TimeWindowOptions {
  /** Start hour in UTC (0-23) */
  startHour: number;
  /** End hour in UTC (0-23) */
  endHour: number;
  /** Days of week allowed (0 = Sunday, 6 = Saturday). Defaults to all days. */
  allowedDays?: number[];
}

/**
 * Time window permission - restricts action execution to specific hours and days.
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
export class TimeWindow implements PermissionTemplate {
  readonly type = 'time-window';
  private readonly options: TimeWindowOptions;
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
      ...options,
      allowedDays,
    };
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
   * Check if an action is within the allowed time window.
   */
  check(_action: ActionInput): PermissionCheckResult {
    if (!this.active) {
      return { allowed: true };
    }

    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();

    // Check day of week
    const allowedDays = this.options.allowedDays ?? [];
    if (!allowedDays.includes(day)) {
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
   * Convert to permission config format.
   */
  toPermission(): TimeWindowPermission {
    return {
      id: `time-window-${this.options.startHour}-${this.options.endHour}`,
      type: 'time-window',
      active: this.active,
      startHour: this.options.startHour,
      endHour: this.options.endHour,
      allowedDays: this.options.allowedDays ?? [0, 1, 2, 3, 4, 5, 6],
    };
  }
}
