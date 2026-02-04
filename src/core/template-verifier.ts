/**
 * Template verifier for Invariance Protocol.
 * Main verification engine that orchestrates all template checks.
 */

import type {
  ActionInput,
  InvarianceTemplate,
  TemplateId,
  TemplateCheckResult,
  VerificationContext,
  RuleCheckResults,
  RuleResult,
  RuleDetail,
} from '@invariance/common';

import { TemplateRegistry } from '../templates/registry.js';
import { checkAuthorization } from '../templates/authorization/checker.js';
import { checkCondition } from '../templates/conditions/checker.js';
import { checkTiming, type TimingState } from '../templates/timing/checker.js';
import { checkRateLimit, RateLimitState } from '../templates/rate-limiting/checker.js';

/**
 * Main template verification engine.
 */
export class TemplateVerifier {
  private readonly registry: TemplateRegistry;
  private readonly rateLimitState: RateLimitState;
  private readonly timingState: TimingState;

  constructor() {
    this.registry = new TemplateRegistry();
    this.rateLimitState = new RateLimitState();
    this.timingState = {
      lastExecution: new Map(),
      executionCounts: new Map(),
    };
  }

  /**
   * Register a template for verification.
   *
   * @param template - The template to register
   */
  registerTemplate(template: InvarianceTemplate): void {
    this.registry.registerData(template);
  }

  /**
   * Unregister a template.
   *
   * @param templateId - The template ID to unregister
   * @returns True if the template was found and removed
   */
  unregisterTemplate(templateId: TemplateId | string): boolean {
    return this.registry.unregister(templateId);
  }

  /**
   * Check if a template exists.
   *
   * @param templateId - The template ID to check
   */
  hasTemplate(templateId: TemplateId | string): boolean {
    return this.registry.has(templateId);
  }

  /**
   * Get a registered template.
   *
   * @param templateId - The template ID to get
   */
  getTemplate(templateId: TemplateId | string): InvarianceTemplate | undefined {
    return this.registry.getData(templateId);
  }

  /**
   * Check an action against a template.
   *
   * @param templateId - The template to check against
   * @param action - The action to verify
   * @param context - The verification context
   * @param proofs - Optional proof data for each rule category
   * @returns The template check result
   */
  async checkTemplate(
    templateId: TemplateId | string,
    _action: ActionInput,
    context: VerificationContext,
    proofs?: TemplateProofs,
  ): Promise<TemplateCheckResult> {
    const template = this.registry.getData(templateId);

    if (!template) {
      return this.createFailResult(
        templateId as TemplateId,
        `Template not found: ${templateId}`,
        this.createEmptyRuleResults(),
      );
    }

    if (!template.options.active) {
      return this.createFailResult(
        template.options.templateId,
        'Template is inactive',
        this.createEmptyRuleResults(),
      );
    }

    const ruleResults: RuleCheckResults = {};
    const errors: Array<{ code: string; message: string; rule?: string }> = [];

    // Check authorization rules
    if (template.verification.authorization && template.verification.authorization.length > 0) {
      const authResult = await this.checkAuthorizationRules(
        template.verification.authorization,
        context,
        proofs?.authorization,
      );
      ruleResults.authorization = authResult;

      if (!authResult.passed) {
        return this.createFailResult(
          template.options.templateId,
          `Authorization failed: ${authResult.details?.[0]?.message ?? 'Unknown'}`,
          ruleResults,
          errors,
        );
      }
    }

    // Check state conditions
    if (template.verification.conditions && template.verification.conditions.length > 0) {
      const condResult = await this.checkConditionRules(
        template.verification.conditions,
        context,
        proofs?.conditions,
      );
      ruleResults.conditions = condResult;

      if (!condResult.passed) {
        return this.createFailResult(
          template.options.templateId,
          `Condition failed: ${condResult.details?.[0]?.message ?? 'Unknown'}`,
          ruleResults,
          errors,
        );
      }
    }

    // Check timing rules
    if (template.verification.timing && template.verification.timing.length > 0) {
      const timingResult = await this.checkTimingRules(
        template.verification.timing,
        context,
      );
      ruleResults.timing = timingResult;

      if (!timingResult.passed) {
        return this.createFailResult(
          template.options.templateId,
          `Timing failed: ${timingResult.details?.[0]?.message ?? 'Unknown'}`,
          ruleResults,
          errors,
        );
      }
    }

    // Check rate limits
    if (template.verification.rateLimits && template.verification.rateLimits.length > 0) {
      const rateResult = await this.checkRateLimitRules(
        template.verification.rateLimits,
        context,
      );
      ruleResults.rateLimits = rateResult;

      if (!rateResult.passed) {
        return this.createFailResult(
          template.options.templateId,
          `Rate limit exceeded: ${rateResult.details?.[0]?.message ?? 'Unknown'}`,
          ruleResults,
          errors,
        );
      }
    }

    // All checks passed - record execution for rate limiting
    this.recordExecution(templateId as string, context);

    return {
      allowed: true,
      templateId: template.options.templateId,
      timestamp: Date.now(),
      ruleResults,
    };
  }

  /**
   * Check authorization rules.
   */
  private async checkAuthorizationRules(
    rules: NonNullable<InvarianceTemplate['verification']['authorization']>,
    context: VerificationContext,
    proofs?: unknown[],
  ): Promise<RuleResult> {
    const details: RuleDetail[] = [];
    let passed = true;
    let rulesPassed = 0;

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]!;
      const proof = proofs?.[i];
      const result = await checkAuthorization(rule, context, proof);

      const detail: RuleDetail = {
        ruleType: rule.type,
        passed: result.passed,
      };
      if (result.message) detail.message = result.message;
      if (result.data) detail.data = result.data;
      details.push(detail);

      if (result.passed) {
        rulesPassed++;
      } else if (rule.required !== false) {
        passed = false;
      }
    }

    return {
      passed,
      rulesChecked: rules.length,
      rulesPassed,
      details,
    };
  }

  /**
   * Check condition rules.
   */
  private async checkConditionRules(
    conditions: NonNullable<InvarianceTemplate['verification']['conditions']>,
    context: VerificationContext,
    proofs?: unknown[],
  ): Promise<RuleResult> {
    const details: RuleDetail[] = [];
    let passed = true;
    let rulesPassed = 0;

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i]!;
      const proof = proofs?.[i];
      const result = await checkCondition(condition, context, proof);

      const detail: RuleDetail = {
        ruleType: condition.type,
        passed: result.passed,
      };
      if (result.message) detail.message = result.message;
      if (result.data) detail.data = result.data;
      details.push(detail);

      if (result.passed) {
        rulesPassed++;
      } else if (condition.required !== false) {
        passed = false;
      }
    }

    return {
      passed,
      rulesChecked: conditions.length,
      rulesPassed,
      details,
    };
  }

  /**
   * Check timing rules.
   */
  private async checkTimingRules(
    rules: NonNullable<InvarianceTemplate['verification']['timing']>,
    context: VerificationContext,
  ): Promise<RuleResult> {
    const details: RuleDetail[] = [];
    let passed = true;
    let rulesPassed = 0;

    for (const rule of rules) {
      const result = await checkTiming(rule, context, this.timingState);

      const detail: RuleDetail = {
        ruleType: rule.type,
        passed: result.passed,
      };
      if (result.message) detail.message = result.message;
      if (result.data) detail.data = result.data;
      details.push(detail);

      if (result.passed) {
        rulesPassed++;
      } else if (rule.required !== false) {
        passed = false;
      }
    }

    return {
      passed,
      rulesChecked: rules.length,
      rulesPassed,
      details,
    };
  }

  /**
   * Check rate limit rules.
   */
  private async checkRateLimitRules(
    rules: NonNullable<InvarianceTemplate['verification']['rateLimits']>,
    context: VerificationContext,
  ): Promise<RuleResult> {
    const details: RuleDetail[] = [];
    let passed = true;
    let rulesPassed = 0;

    for (const rule of rules) {
      const result = await checkRateLimit(rule, context, this.rateLimitState);

      const detail: RuleDetail = {
        ruleType: rule.type,
        passed: result.passed,
      };
      if (result.message) detail.message = result.message;
      if (result.data) detail.data = result.data;
      details.push(detail);

      if (result.passed) {
        rulesPassed++;
      } else if (rule.required !== false) {
        passed = false;
      }
    }

    return {
      passed,
      rulesChecked: rules.length,
      rulesPassed,
      details,
    };
  }

  /**
   * Record an execution for rate limiting and cooldown tracking.
   */
  private recordExecution(templateId: string, context: VerificationContext): void {
    // Record for rate limiting
    const key = `template:${templateId}:${context.sender.toLowerCase()}`;
    this.rateLimitState.recordExecution(key, context.timestamp);

    // Record for cooldown
    this.timingState.lastExecution?.set(context.sender.toLowerCase(), context.timestamp);

    // Cleanup old entries periodically
    if (Math.random() < 0.1) {
      this.rateLimitState.cleanup(86400 * 1000, context.timestamp);
    }
  }

  /**
   * Create a failed check result.
   */
  private createFailResult(
    templateId: TemplateId,
    reason: string,
    ruleResults: RuleCheckResults,
    errors?: Array<{ code: string; message: string; rule?: string }>,
  ): TemplateCheckResult {
    const result: TemplateCheckResult = {
      allowed: false,
      templateId,
      timestamp: Date.now(),
      ruleResults,
      reason,
    };
    if (errors && errors.length > 0) {
      result.errors = errors;
    }
    return result;
  }

  /**
   * Create empty rule results.
   */
  private createEmptyRuleResults(): RuleCheckResults {
    return {};
  }

  /**
   * Reset all state (useful for testing).
   */
  reset(): void {
    this.registry.clear();
    this.timingState.lastExecution?.clear();
    this.timingState.executionCounts?.clear();
  }
}

/**
 * Proof data for template verification.
 */
export interface TemplateProofs {
  /** Proofs for authorization rules */
  authorization?: unknown[];
  /** Proofs for condition rules */
  conditions?: unknown[];
  /** Proofs for staking rules */
  staking?: unknown[];
}
