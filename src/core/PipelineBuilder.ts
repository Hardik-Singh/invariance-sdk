/**
 * Fluent pipeline builder for multi-step workflows with auto-linked context.
 *
 * @example
 * ```typescript
 * const result = await inv.pipeline()
 *   .register({ type: 'agent', label: 'Bot', owner: '0x...' })
 *   .createPolicy({ template: 'defi-trading' })
 *   .attachPolicy()
 *   .fundWallet({ amount: '100' })
 *   .execute();
 * ```
 */
import type { Invariance } from './InvarianceClient.js';
import type { RegisterIdentityOptions, CreatePolicyOptions } from '@invariance/common';
import type { PipelineResult, PipelineStep } from './convenience-types.js';
import { buildPolicyFromTemplate } from '../modules/policy/templates.js';

/** Shared context passed between pipeline steps */
type PipelineContext = Map<string, unknown>;

/** A step definition in the pipeline */
interface StepDef {
  name: string;
  fn: (ctx: PipelineContext, inv: Invariance) => Promise<unknown>;
}

/**
 * Fluent builder for multi-step agent workflows.
 *
 * Steps store results in a shared context map. Later steps auto-read
 * values (like identityId, policyId) from context.
 */
export class PipelineBuilder {
  private readonly inv: Invariance;
  private readonly steps: StepDef[] = [];

  constructor(inv: Invariance) {
    this.inv = inv;
  }

  /**
   * Register an identity. Stores `identityId` and `identity` in context.
   */
  register(opts: RegisterIdentityOptions): this {
    this.steps.push({
      name: 'register',
      fn: async (ctx) => {
        const identity = await this.inv.identity.register(opts);
        ctx.set('identityId', identity.identityId);
        ctx.set('identity', identity);
        return identity;
      },
    });
    return this;
  }

  /**
   * Create a policy. Accepts either a template name or full options.
   * Stores `policyId` and `policy` in context.
   */
  createPolicy(opts: { template: string; expiry?: string } | CreatePolicyOptions): this {
    this.steps.push({
      name: 'createPolicy',
      fn: async (ctx) => {
        let policyOpts: CreatePolicyOptions;
        if ('template' in opts) {
          const overrides = opts.expiry ? { expiry: opts.expiry } : undefined;
          policyOpts = buildPolicyFromTemplate(opts.template, overrides);
        } else {
          policyOpts = opts;
        }
        const policy = await this.inv.policy.create(policyOpts);
        ctx.set('policyId', policy.policyId);
        ctx.set('policy', policy);
        return policy;
      },
    });
    return this;
  }

  /**
   * Attach the policy from context to the identity from context.
   * Auto-reads `policyId` and `identityId` from previous steps.
   */
  attachPolicy(policyId?: string, identityId?: string): this {
    this.steps.push({
      name: 'attachPolicy',
      fn: async (ctx) => {
        const pid = policyId ?? ctx.get('policyId') as string;
        const iid = identityId ?? ctx.get('identityId') as string;
        if (!pid) throw new Error('attachPolicy: no policyId in context. Run createPolicy() first.');
        if (!iid) throw new Error('attachPolicy: no identityId in context. Run register() first.');
        return this.inv.policy.attach(pid, iid);
      },
    });
    return this;
  }

  /**
   * Fund the wallet with a specified amount.
   */
  fundWallet(opts: { amount: string; token?: 'USDC' }): this {
    this.steps.push({
      name: 'fundWallet',
      fn: async () => {
        const address = this.inv.wallet.getAddress();
        return this.inv.wallet.fund(address, { amount: opts.amount, token: opts.token });
      },
    });
    return this;
  }

  /**
   * Add a custom step with access to the pipeline context.
   */
  custom(name: string, fn: (ctx: PipelineContext) => Promise<unknown>): this {
    this.steps.push({ name, fn: async (ctx) => fn(ctx) });
    return this;
  }

  /**
   * Execute all pipeline steps sequentially.
   * Stops on first error with full step-by-step reporting.
   *
   * @returns Pipeline result with success status, step results, and context
   */
  async execute(): Promise<PipelineResult> {
    const ctx: PipelineContext = new Map();
    const stepResults: PipelineStep[] = [];

    for (const step of this.steps) {
      const startTime = Date.now();
      try {
        const result = await step.fn(ctx, this.inv);
        stepResults.push({
          name: step.name,
          success: true,
          result,
          durationMs: Date.now() - startTime,
        });
      } catch (err) {
        stepResults.push({
          name: step.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        });
        return {
          success: false,
          steps: stepResults,
          context: Object.fromEntries(ctx),
        };
      }
    }

    return {
      success: true,
      steps: stepResults,
      context: Object.fromEntries(ctx),
    };
  }
}
