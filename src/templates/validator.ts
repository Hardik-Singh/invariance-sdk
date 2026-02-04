/**
 * Template schema validation for Invariance Protocol.
 */

import type {
  InvarianceTemplate,
  VerificationRules,
  ExecutionConfig,
  AuthorizationRule,
  StateCondition,
  TimingRule,
  RateLimitRule,
  StakingRule,
} from '@invariance/common';

/**
 * Validation error details.
 */
export interface ValidationError {
  /** Path to the invalid field */
  path: string;
  /** Error message */
  message: string;
  /** Invalid value */
  value?: unknown;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Whether the template is valid */
  valid: boolean;
  /** Validation errors (if any) */
  errors: ValidationError[];
  /** Validation warnings (non-blocking issues) */
  warnings: string[];
}

/**
 * Validates InvarianceTemplate objects.
 */
export class TemplateValidator {
  /**
   * Validate a complete template.
   *
   * @param template - The template to validate
   * @returns Validation result
   */
  validate(template: InvarianceTemplate): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate options
    this.validateOptions(template, errors, warnings);

    // Validate verification rules
    if (template.verification) {
      this.validateVerificationRules(template.verification, errors, warnings);
    }

    // Validate execution config
    if (template.execution) {
      this.validateExecutionConfig(template.execution, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate template options.
   */
  private validateOptions(
    template: InvarianceTemplate,
    errors: ValidationError[],
    warnings: string[],
  ): void {
    const { options } = template;

    if (!options.templateId) {
      errors.push({
        path: 'options.templateId',
        message: 'Template ID is required',
      });
    }

    if (!options.name || options.name.trim() === '') {
      errors.push({
        path: 'options.name',
        message: 'Template name is required',
      });
    }

    if (!options.version) {
      errors.push({
        path: 'options.version',
        message: 'Template version is required',
      });
    } else if (!this.isValidSemver(options.version)) {
      warnings.push(`Version "${options.version}" does not follow semver format`);
    }

    if (typeof options.active !== 'boolean') {
      errors.push({
        path: 'options.active',
        message: 'Active flag must be a boolean',
        value: options.active,
      });
    }
  }

  /**
   * Validate verification rules.
   */
  private validateVerificationRules(
    rules: VerificationRules,
    errors: ValidationError[],
    warnings: string[],
  ): void {
    if (rules.authorization) {
      rules.authorization.forEach((rule, index) => {
        this.validateAuthorizationRule(rule, `verification.authorization[${index}]`, errors);
      });
    }

    if (rules.conditions) {
      rules.conditions.forEach((condition, index) => {
        this.validateCondition(condition, `verification.conditions[${index}]`, errors);
      });
    }

    if (rules.timing) {
      rules.timing.forEach((rule, index) => {
        this.validateTimingRule(rule, `verification.timing[${index}]`, errors);
      });
    }

    if (rules.rateLimits) {
      rules.rateLimits.forEach((rule, index) => {
        this.validateRateLimitRule(rule, `verification.rateLimits[${index}]`, errors);
      });
    }

    if (rules.staking) {
      rules.staking.forEach((rule, index) => {
        this.validateStakingRule(rule, `verification.staking[${index}]`, errors);
      });
    }

    // Warn if no verification rules defined
    const hasRules =
      (rules.authorization?.length ?? 0) > 0 ||
      (rules.conditions?.length ?? 0) > 0 ||
      (rules.timing?.length ?? 0) > 0 ||
      (rules.rateLimits?.length ?? 0) > 0 ||
      (rules.staking?.length ?? 0) > 0;

    if (!hasRules) {
      warnings.push('No verification rules defined - template will allow all actions');
    }
  }

  /**
   * Validate an authorization rule.
   */
  private validateAuthorizationRule(
    rule: AuthorizationRule,
    path: string,
    errors: ValidationError[],
  ): void {
    if (!rule.type) {
      errors.push({
        path: `${path}.type`,
        message: 'Authorization type is required',
      });
      return;
    }

    switch (rule.type) {
      case 'signature':
        if (!this.isValidAddress(rule.signer)) {
          errors.push({
            path: `${path}.signer`,
            message: 'Invalid signer address',
            value: rule.signer,
          });
        }
        break;

      case 'multi-sig':
        if (!rule.signers || rule.signers.length === 0) {
          errors.push({
            path: `${path}.signers`,
            message: 'At least one signer is required',
          });
        } else {
          rule.signers.forEach((signer, i) => {
            if (!this.isValidAddress(signer)) {
              errors.push({
                path: `${path}.signers[${i}]`,
                message: 'Invalid signer address',
                value: signer,
              });
            }
          });
        }
        if (rule.requiredSignatures > (rule.signers?.length ?? 0)) {
          errors.push({
            path: `${path}.requiredSignatures`,
            message: 'Required signatures cannot exceed total signers',
          });
        }
        break;

      case 'whitelist':
        if (!rule.addresses || rule.addresses.length === 0) {
          if (!rule.merkleRoot) {
            errors.push({
              path: `${path}.addresses`,
              message: 'Either addresses or merkleRoot is required',
            });
          }
        }
        break;

      case 'token-gated':
        if (!this.isValidAddress(rule.tokenContract)) {
          errors.push({
            path: `${path}.tokenContract`,
            message: 'Invalid token contract address',
            value: rule.tokenContract,
          });
        }
        if (rule.minBalance < 0n) {
          errors.push({
            path: `${path}.minBalance`,
            message: 'Minimum balance cannot be negative',
          });
        }
        break;

      case 'nft-gated':
        if (!this.isValidAddress(rule.nftContract)) {
          errors.push({
            path: `${path}.nftContract`,
            message: 'Invalid NFT contract address',
            value: rule.nftContract,
          });
        }
        break;
    }
  }

  /**
   * Validate a state condition.
   */
  private validateCondition(
    condition: StateCondition,
    path: string,
    errors: ValidationError[],
  ): void {
    if (!condition.type) {
      errors.push({
        path: `${path}.type`,
        message: 'Condition type is required',
      });
      return;
    }

    switch (condition.type) {
      case 'balance-check':
        if (!this.isValidAddress(condition.token)) {
          errors.push({
            path: `${path}.token`,
            message: 'Invalid token address',
            value: condition.token,
          });
        }
        break;

      case 'allowance-check':
        if (!this.isValidAddress(condition.token)) {
          errors.push({
            path: `${path}.token`,
            message: 'Invalid token address',
            value: condition.token,
          });
        }
        if (!this.isValidAddress(condition.spender)) {
          errors.push({
            path: `${path}.spender`,
            message: 'Invalid spender address',
            value: condition.spender,
          });
        }
        break;
    }
  }

  /**
   * Validate a timing rule.
   */
  private validateTimingRule(
    rule: TimingRule,
    path: string,
    errors: ValidationError[],
  ): void {
    if (!rule.type) {
      errors.push({
        path: `${path}.type`,
        message: 'Timing rule type is required',
      });
      return;
    }

    switch (rule.type) {
      case 'time-window':
        if (rule.startHour < 0 || rule.startHour > 23) {
          errors.push({
            path: `${path}.startHour`,
            message: 'Start hour must be between 0 and 23',
            value: rule.startHour,
          });
        }
        if (rule.endHour < 0 || rule.endHour > 23) {
          errors.push({
            path: `${path}.endHour`,
            message: 'End hour must be between 0 and 23',
            value: rule.endHour,
          });
        }
        break;

      case 'cooldown':
        if (rule.periodSeconds <= 0) {
          errors.push({
            path: `${path}.periodSeconds`,
            message: 'Cooldown period must be positive',
            value: rule.periodSeconds,
          });
        }
        break;

      case 'after-timestamp':
      case 'before-timestamp':
        if (rule.timestamp <= 0) {
          errors.push({
            path: `${path}.timestamp`,
            message: 'Timestamp must be positive',
            value: rule.timestamp,
          });
        }
        break;
    }
  }

  /**
   * Validate a rate limit rule.
   */
  private validateRateLimitRule(
    rule: RateLimitRule,
    path: string,
    errors: ValidationError[],
  ): void {
    if (!rule.type) {
      errors.push({
        path: `${path}.type`,
        message: 'Rate limit type is required',
      });
      return;
    }

    switch (rule.type) {
      case 'per-address':
      case 'per-function':
      case 'global-limit':
        if ('maxExecutions' in rule && rule.maxExecutions <= 0) {
          errors.push({
            path: `${path}.maxExecutions`,
            message: 'Max executions must be positive',
            value: rule.maxExecutions,
          });
        }
        if ('windowSeconds' in rule && rule.windowSeconds <= 0) {
          errors.push({
            path: `${path}.windowSeconds`,
            message: 'Window seconds must be positive',
            value: rule.windowSeconds,
          });
        }
        break;

      case 'value-limit':
        if (rule.maxValue <= 0n) {
          errors.push({
            path: `${path}.maxValue`,
            message: 'Max value must be positive',
          });
        }
        break;
    }
  }

  /**
   * Validate a staking rule.
   */
  private validateStakingRule(
    rule: StakingRule,
    path: string,
    errors: ValidationError[],
  ): void {
    if (!rule.type) {
      errors.push({
        path: `${path}.type`,
        message: 'Staking rule type is required',
      });
      return;
    }

    if ('stakingContract' in rule && !this.isValidAddress(rule.stakingContract)) {
      errors.push({
        path: `${path}.stakingContract`,
        message: 'Invalid staking contract address',
        value: rule.stakingContract,
      });
    }

    if ('token' in rule && !this.isValidAddress(rule.token)) {
      errors.push({
        path: `${path}.token`,
        message: 'Invalid token address',
        value: rule.token,
      });
    }
  }

  /**
   * Validate execution config.
   */
  private validateExecutionConfig(
    config: ExecutionConfig,
    errors: ValidationError[],
    _warnings: string[],
  ): void {
    if (!config.mode) {
      errors.push({
        path: 'execution.mode',
        message: 'Execution mode is required',
      });
      return;
    }

    switch (config.mode.type) {
      case 'delayed':
        if (config.mode.delaySeconds <= 0) {
          errors.push({
            path: 'execution.mode.delaySeconds',
            message: 'Delay seconds must be positive',
            value: config.mode.delaySeconds,
          });
        }
        break;

      case 'optimistic':
        if (config.mode.challengePeriodSeconds <= 0) {
          errors.push({
            path: 'execution.mode.challengePeriodSeconds',
            message: 'Challenge period must be positive',
            value: config.mode.challengePeriodSeconds,
          });
        }
        break;
    }
  }

  /**
   * Check if a string is a valid Ethereum address.
   */
  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Check if a string follows semver format.
   */
  private isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version);
  }
}

/**
 * Global validator instance.
 */
export const templateValidator = new TemplateValidator();
