import type { ActionCategory } from '@invariance/common';
import { DEFAULT_POLICY_VALUES } from '@invariance/common';

/**
 * Entry tracking the last execution time for an actor/category pair.
 */
interface CooldownEntry {
  /** Timestamp of last execution (ms) */
  lastExecutionTime: number;
  /** Cooldown duration in seconds */
  cooldownSeconds: number;
}

/**
 * Tracks cooldowns between same-category actions per actor.
 * This class maintains state about when actions were last executed
 * and enforces cooldown periods between executions.
 */
export class CooldownTracker {
  /** Map of actor -> category -> cooldown entry */
  private cooldowns: Map<string, Map<ActionCategory, CooldownEntry>> = new Map();

  /** Default cooldown in seconds */
  private defaultCooldownSeconds: number;

  constructor(defaultCooldownSeconds?: number) {
    this.defaultCooldownSeconds =
      defaultCooldownSeconds ?? DEFAULT_POLICY_VALUES.cooldownSeconds;
  }

  /**
   * Check if an actor can execute an action of the given category.
   *
   * @param actor - The actor address (EOA, contract, or smart account)
   * @param category - The action category
   * @param cooldownSeconds - Optional override for cooldown duration
   * @returns True if the actor can execute (cooldown has passed)
   */
  canExecute(
    actor: string,
    category: ActionCategory,
    cooldownSeconds?: number
  ): boolean {
    const remaining = this.getRemainingCooldown(actor, category, cooldownSeconds);
    return remaining <= 0;
  }

  /**
   * Get the remaining cooldown time for an actor/category pair.
   *
   * @param actor - The actor address
   * @param category - The action category
   * @param cooldownSeconds - Optional override for cooldown duration
   * @returns Remaining cooldown in seconds (0 if no cooldown active)
   */
  getRemainingCooldown(
    actor: string,
    category: ActionCategory,
    cooldownSeconds?: number
  ): number {
    const actorCooldowns = this.cooldowns.get(actor);
    if (!actorCooldowns) {
      return 0;
    }

    const entry = actorCooldowns.get(category);
    if (!entry) {
      return 0;
    }

    const cooldown = cooldownSeconds ?? entry.cooldownSeconds;
    const elapsedMs = Date.now() - entry.lastExecutionTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    return Math.max(0, cooldown - elapsedSeconds);
  }

  /**
   * Record an execution for an actor/category pair.
   * This should be called after a successful action execution.
   *
   * @param actor - The actor address
   * @param category - The action category
   * @param cooldownSeconds - Cooldown duration in seconds (uses default if not specified)
   */
  recordExecution(
    actor: string,
    category: ActionCategory,
    cooldownSeconds?: number
  ): void {
    let actorCooldowns = this.cooldowns.get(actor);
    if (!actorCooldowns) {
      actorCooldowns = new Map();
      this.cooldowns.set(actor, actorCooldowns);
    }

    actorCooldowns.set(category, {
      lastExecutionTime: Date.now(),
      cooldownSeconds: cooldownSeconds ?? this.defaultCooldownSeconds,
    });
  }

  /**
   * Clear cooldown for a specific actor/category pair.
   *
   * @param actor - The actor address
   * @param category - The action category
   */
  clearCooldown(actor: string, category: ActionCategory): void {
    const actorCooldowns = this.cooldowns.get(actor);
    if (actorCooldowns) {
      actorCooldowns.delete(category);
    }
  }

  /**
   * Clear all cooldowns for an actor.
   *
   * @param actor - The actor address
   */
  clearActorCooldowns(actor: string): void {
    this.cooldowns.delete(actor);
  }

  /**
   * Clear all tracked cooldowns.
   */
  clearAll(): void {
    this.cooldowns.clear();
  }

  /**
   * Get all active cooldowns for an actor.
   *
   * @param actor - The actor address
   * @returns Map of category to remaining cooldown seconds
   */
  getActorCooldowns(actor: string): Map<ActionCategory, number> {
    const result = new Map<ActionCategory, number>();
    const actorCooldowns = this.cooldowns.get(actor);

    if (!actorCooldowns) {
      return result;
    }

    for (const [category, _entry] of actorCooldowns) {
      const remaining = this.getRemainingCooldown(actor, category);
      if (remaining > 0) {
        result.set(category, remaining);
      }
    }

    return result;
  }
}
