/**
 * Generic pre/post action hooks for ANY agent runtime.
 * 3-line integration for any framework.
 *
 * @example
 * ```typescript
 * const hooks = new RuntimeHookAdapter(inv);
 * const { allowed } = await hooks.beforeAction({ action: 'swap', actor, params: {} });
 * await hooks.afterAction(ctx, { success: true, txHash: '0x...' });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';
import type { ActorReference } from '@invariance/common';

/** Action context passed through hooks */
export interface ActionContext {
  /** Action identifier (e.g., 'swap', 'transfer') */
  action: string;
  /** Actor performing the action */
  actor: ActorReference;
  /** Action parameters */
  params: Record<string, unknown>;
  /** Optional policy to evaluate against */
  policyId?: string;
  /** Timestamp of action initiation */
  timestamp: number;
}

/** Result from beforeAction hook */
export interface BeforeActionResult {
  /** Whether the action is permitted */
  allowed: boolean;
  /** Reason if denied */
  reason?: string;
  /** Policy evaluation details */
  policyId?: string;
}

/** Result from afterAction hook */
export interface AfterActionResult {
  /** Ledger entry ID */
  entryId: string;
  /** Transaction hash */
  txHash: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/** Hook callbacks for custom logic */
export interface RuntimeHooks {
  /** Called before policy evaluation */
  onBeforeEvaluate?: (ctx: ActionContext) => Promise<void> | void;
  /** Called after policy evaluation, before execution */
  onAfterEvaluate?: (ctx: ActionContext, result: BeforeActionResult) => Promise<void> | void;
  /** Called after logging */
  onAfterLog?: (ctx: ActionContext, result: AfterActionResult) => Promise<void> | void;
  /** Called on any error */
  onError?: (ctx: ActionContext, error: Error) => Promise<void> | void;
}

/**
 * RuntimeHookAdapter — drop-in verification for any agent runtime.
 *
 * @example
 * ```typescript
 * const hooks = new RuntimeHookAdapter(inv);
 * // Wrap any agent action:
 * const { result, log } = await hooks.wrap(
 *   { action: 'swap', actor: { type: 'agent', address: '0x...' }, params: {} },
 *   () => executeSwap(),
 * );
 * ```
 */
export class RuntimeHookAdapter {
  private readonly client: Invariance;
  private readonly hooks: RuntimeHooks;

  constructor(client: Invariance, hooks?: RuntimeHooks) {
    this.client = client;
    this.hooks = hooks ?? {};
  }

  /**
   * Evaluate policy and request intent before action execution.
   */
  async beforeAction(ctx: Omit<ActionContext, 'timestamp'>): Promise<BeforeActionResult> {
    const fullCtx: ActionContext = { ...ctx, timestamp: Date.now() };

    try {
      await this.hooks.onBeforeEvaluate?.(fullCtx);

      if (fullCtx.policyId) {
        const evaluation = await this.client.policy.evaluate({
          policyId: fullCtx.policyId,
          actor: fullCtx.actor,
          action: fullCtx.action,
          params: fullCtx.params,
        });

        const result: BeforeActionResult = { allowed: evaluation.allowed, policyId: fullCtx.policyId };
        if (!evaluation.allowed) {
          const reason = evaluation.ruleResults.find((r) => !r.passed)?.detail;
          if (reason) result.reason = reason;
        }

        await this.hooks.onAfterEvaluate?.(fullCtx, result);
        return result;
      }

      const result: BeforeActionResult = { allowed: true };
      await this.hooks.onAfterEvaluate?.(fullCtx, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.hooks.onError?.(fullCtx, err);
      throw err;
    }
  }

  /**
   * Log action result to immutable ledger after execution.
   */
  async afterAction(
    ctx: Omit<ActionContext, 'timestamp'>,
    outcome: { success: boolean; txHash?: string; error?: string; metadata?: Record<string, unknown> },
  ): Promise<AfterActionResult> {
    const fullCtx: ActionContext = { ...ctx, timestamp: Date.now() };
    const startTime = Date.now();

    try {
      const entry = await this.client.ledger.log({
        action: fullCtx.action,
        actor: fullCtx.actor,
        category: 'custom',
        metadata: {
          params: fullCtx.params,
          success: outcome.success,
          txHash: outcome.txHash,
          error: outcome.error,
          ...outcome.metadata,
        },
      });

      const result: AfterActionResult = {
        entryId: entry.entryId,
        txHash: entry.txHash,
        durationMs: Date.now() - startTime,
      };

      await this.hooks.onAfterLog?.(fullCtx, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.hooks.onError?.(fullCtx, err);
      throw err;
    }
  }

  /**
   * Wrap an async function with before/after hooks.
   */
  async wrap<T>(
    ctx: Omit<ActionContext, 'timestamp'>,
    fn: () => Promise<T>,
  ): Promise<{ result: T; log: AfterActionResult }> {
    const before = await this.beforeAction(ctx);
    if (!before.allowed) {
      throw new Error(`Action '${ctx.action}' denied: ${before.reason ?? 'policy violation'}`);
    }

    let result: T;
    let txHash: string | undefined;
    try {
      result = await fn();
      if (result && typeof result === 'object' && 'txHash' in result) {
        txHash = (result as Record<string, unknown>)['txHash'] as string | undefined;
      }
    } catch (error) {
      await this.afterAction(ctx, { success: false, error: String(error) });
      throw error;
    }

    const afterOpts: { success: boolean; txHash?: string } = { success: true };
    if (txHash) afterOpts.txHash = txHash;
    const log = await this.afterAction(ctx, afterOpts);
    return { result, log };
  }
}
