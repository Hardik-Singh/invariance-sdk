/**
 * Base template class for Invariance Protocol.
 * Provides common functionality for all template implementations.
 */

import type {
  ActionInput,
  InvarianceTemplate,
  TemplateId,
  TemplateOptions,
  TemplateCheckResult,
  VerificationRules,
  ExecutionConfig,
  MonitoringConfig,
  VerificationContext,
  FunctionDefinition,
  RuleCheckResults,
} from '@invariance/common';

/**
 * Abstract base class for template implementations.
 * Extend this class to create custom templates.
 */
export abstract class BaseTemplate {
  protected readonly options: TemplateOptions;
  protected verification: Partial<VerificationRules>;
  protected execution: Partial<ExecutionConfig>;
  protected monitoring: Partial<MonitoringConfig>;
  protected functions: FunctionDefinition[];

  constructor(options: Omit<TemplateOptions, 'templateId'> & { templateId?: TemplateId | string }) {
    this.options = {
      ...options,
      templateId: (typeof options.templateId === 'string'
        ? options.templateId
        : options.templateId ?? this.generateTemplateId()) as TemplateId,
    };
    this.verification = {};
    this.execution = {};
    this.monitoring = {};
    this.functions = [];
  }

  /**
   * Generate a unique template ID.
   */
  private generateTemplateId(): string {
    return `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get the template ID.
   */
  get templateId(): TemplateId {
    return this.options.templateId;
  }

  /**
   * Get the template name.
   */
  get name(): string {
    return this.options.name;
  }

  /**
   * Get the template version.
   */
  get version(): string {
    return this.options.version;
  }

  /**
   * Check if the template is active.
   */
  isActive(): boolean {
    return this.options.active;
  }

  /**
   * Activate the template.
   */
  activate(): void {
    this.options.active = true;
  }

  /**
   * Deactivate the template.
   */
  deactivate(): void {
    this.options.active = false;
  }

  /**
   * Check if an action passes all template verification rules.
   * This is the main entry point for template verification.
   *
   * @param action - The action to verify
   * @param context - The verification context
   * @returns The result of the template check
   */
  abstract check(action: ActionInput, context: VerificationContext): TemplateCheckResult;

  /**
   * Async version of check for templates that require async operations.
   *
   * @param action - The action to verify
   * @param context - The verification context
   * @returns Promise resolving to the template check result
   */
  async checkAsync(action: ActionInput, context: VerificationContext): Promise<TemplateCheckResult> {
    return this.check(action, context);
  }

  /**
   * Convert this template to an InvarianceTemplate object.
   * Useful for serialization and storage.
   */
  toTemplate(): InvarianceTemplate {
    return {
      options: this.options,
      functions: this.functions,
      verification: this.verification as VerificationRules,
      execution: this.execution as ExecutionConfig,
      monitoring: this.monitoring as MonitoringConfig,
    };
  }

  /**
   * Create a successful check result.
   */
  protected createPassResult(ruleResults: RuleCheckResults): TemplateCheckResult {
    return {
      allowed: true,
      templateId: this.options.templateId,
      timestamp: Date.now(),
      ruleResults,
    };
  }

  /**
   * Create a failed check result.
   */
  protected createFailResult(
    reason: string,
    ruleResults: RuleCheckResults,
    errors?: Array<{ code: string; message: string; rule?: string }>,
  ): TemplateCheckResult {
    const result: TemplateCheckResult = {
      allowed: false,
      templateId: this.options.templateId,
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
   * Create an empty rule result for categories not being checked.
   */
  protected createEmptyRuleResult(): { passed: boolean; rulesChecked: number; rulesPassed: number } {
    return {
      passed: true,
      rulesChecked: 0,
      rulesPassed: 0,
    };
  }
}

/**
 * Type for template class constructors.
 */
export type TemplateConstructor<T extends BaseTemplate = BaseTemplate> = new (
  ...args: unknown[]
) => T;
