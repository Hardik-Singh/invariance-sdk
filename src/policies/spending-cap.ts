import type {
  ActionInput,
  PolicyCheckResult,
  SpendingCapPolicy,
  ActorType,
  ActionCategory,
} from '@invariance/common';
import { DEFAULT_POLICY_VALUES } from '@invariance/common';
import type { ExecutionPolicy } from './types.js';

/**
 * Options for creating a spending cap policy.
 */
export interface SpendingCapOptions {
  /** Maximum amount per single transaction (in wei) */
  maxPerTx: bigint;
  /** Maximum amount per day (in wei) */
  maxPerDay: bigint;
  /** Token address (use '0x0000000000000000000000000000000000000000' for native ETH) */
  token?: string;

  // NEW OPTIONAL FIELDS (v2.0)
  /** Policy version (default: "1.0.0") */
  version?: string;
  /** Max gas per action (default: 5_000_000n) */
  maxGas?: bigint;
  /** Max value per action (default: maxPerTx) */
  maxValue?: bigint;
  /** Allowed actor types (default: ['any']) */
  allowedActors?: ActorType[];
  /** Action category (default: 'TRANSFER') */
  category?: ActionCategory;
  /** Cooldown between same-category actions in seconds (default: 300) */
  cooldownSeconds?: number;
}

/**
 * Spending cap policy - limits ETH/token spending per transaction and per day.
 *
 * @example
 * ```typescript
 * const spendingCap = new SpendingCap({
 *   maxPerTx: 1000000000000000000n, // 1 ETH per tx
 *   maxPerDay: 5000000000000000000n, // 5 ETH per day
 * });
 * ```
 */
export class SpendingCap implements ExecutionPolicy {
  readonly type = 'spending-cap';
  private readonly options: Required<
    Pick<SpendingCapOptions, 'maxPerTx' | 'maxPerDay' | 'token' | 'version' | 'maxGas' | 'maxValue' | 'allowedActors' | 'category' | 'cooldownSeconds'>
  >;
  private active = true;
  private dailySpent = 0n;
  private lastResetDate: string;

  constructor(options: SpendingCapOptions) {
    this.options = {
      maxPerTx: options.maxPerTx,
      maxPerDay: options.maxPerDay,
      token: options.token ?? '0x0000000000000000000000000000000000000000',
      version: options.version ?? DEFAULT_POLICY_VALUES.version,
      maxGas: options.maxGas ?? DEFAULT_POLICY_VALUES.maxGas,
      maxValue: options.maxValue ?? options.maxPerTx,
      allowedActors: options.allowedActors ?? DEFAULT_POLICY_VALUES.allowedActors,
      category: options.category ?? 'TRANSFER',
      cooldownSeconds: options.cooldownSeconds ?? DEFAULT_POLICY_VALUES.cooldownSeconds,
    };
    this.lastResetDate = new Date().toISOString().split('T')[0] ?? '';
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
   * Check if an action passes the spending cap.
   */
  check(action: ActionInput): PolicyCheckResult {
    if (!this.active) {
      return { allowed: true };
    }

    // Reset daily counter if new day
    this.maybeResetDailyCounter();

    // Extract amount from action params
    const amount = this.extractAmount(action);
    if (amount === null) {
      // No amount in action, allow
      return { allowed: true };
    }

    // Check per-transaction limit
    if (amount > this.options.maxPerTx) {
      return {
        allowed: false,
        reason: `Transaction amount (${amount}) exceeds per-tx limit (${this.options.maxPerTx})`,
      };
    }

    // Check daily limit
    const newDailyTotal = this.dailySpent + amount;
    if (newDailyTotal > this.options.maxPerDay) {
      return {
        allowed: false,
        reason: `Daily spending would exceed limit (${this.options.maxPerDay})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a spent amount (call after successful execution).
   */
  recordSpent(amount: bigint): void {
    this.maybeResetDailyCounter();
    this.dailySpent += amount;
  }

  /**
   * Get the current daily spent amount.
   */
  getDailySpent(): bigint {
    this.maybeResetDailyCounter();
    return this.dailySpent;
  }

  /**
   * Convert to policy config format.
   */
  toPolicy(): SpendingCapPolicy {
    return {
      id: `spending-cap-${this.options.token === '0x0000000000000000000000000000000000000000' ? 'eth' : this.options.token}`,
      type: 'spending-cap',
      active: this.active,
      maxPerTx: this.options.maxPerTx,
      maxPerDay: this.options.maxPerDay,
      token: this.options.token,
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
  toPermission(): SpendingCapPolicy {
    return this.toPolicy();
  }

  /**
   * Reset daily counter if it's a new day.
   */
  private maybeResetDailyCounter(): void {
    const today = new Date().toISOString().split('T')[0] ?? '';
    if (today !== this.lastResetDate) {
      this.dailySpent = 0n;
      this.lastResetDate = today;
    }
  }

  /**
   * Extract amount from action params.
   */
  private extractAmount(action: ActionInput): bigint | null {
    const params = action.params;

    // Try common amount field names
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
}
