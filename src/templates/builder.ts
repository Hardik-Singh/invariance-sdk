/**
 * Fluent builder API for creating templates.
 */

import type {
  InvarianceTemplate,
  TemplateId,
  TemplateOptions,
  VerificationRules,
  ExecutionConfig,
  MonitoringConfig,
  FunctionDefinition,
  AuthorizationRule,
  SignatureAuthorization,
  MultiSigAuthorization,
  WhitelistAuthorization,
  TokenGatedAuthorization,
  NFTGatedAuthorization,
  StateCondition,
  BalanceCheckCondition,
  AllowanceCheckCondition,
  TimingRule,
  TimeWindowRule,
  CooldownRule,
  AfterTimestampRule,
  BeforeTimestampRule,
  RateLimitRule,
  PerAddressRateLimit,
  ValueRateLimit,
  StakingRule,
  FixedStakeRule,
  ExecutionMode,
  ImmediateExecutionMode,
  DelayedExecutionMode,
  OptimisticExecutionMode,
  LoggingLevel,
  DayOfWeek,
  ComparisonOperator,
} from '@invariance/common';

/**
 * Fluent builder for creating InvarianceTemplate objects.
 *
 * @example
 * ```typescript
 * const template = TemplateBuilder.create('my-transfer')
 *   .withDescription('Simple transfer template')
 *   .requireSignature(agentAddress)
 *   .requireBalance(USDC, 1000n)
 *   .withCooldown(300)
 *   .limitPerAddress(10, 3600)
 *   .immediate()
 *   .build();
 * ```
 */
export class TemplateBuilder {
  private options: Partial<TemplateOptions>;
  private functions: FunctionDefinition[] = [];
  private verification: Partial<VerificationRules> = {};
  private execution: Partial<ExecutionConfig> = {};
  private monitoring: Partial<MonitoringConfig> = {};

  private constructor(name: string) {
    this.options = {
      name,
      version: '1.0.0',
      active: true,
    };
  }

  /**
   * Create a new template builder.
   *
   * @param name - The template name
   * @returns A new TemplateBuilder instance
   */
  static create(name: string): TemplateBuilder {
    return new TemplateBuilder(name);
  }

  // ============================================================================
  // Metadata Methods
  // ============================================================================

  /**
   * Set the template ID.
   */
  withId(templateId: string): this {
    this.options.templateId = templateId as TemplateId;
    return this;
  }

  /**
   * Set the template description.
   */
  withDescription(description: string): this {
    this.options.description = description;
    return this;
  }

  /**
   * Set the template version.
   */
  withVersion(version: string): this {
    this.options.version = version;
    return this;
  }

  /**
   * Set the template owner.
   */
  withOwner(owner: string): this {
    this.options.owner = owner;
    return this;
  }

  /**
   * Add tags to the template.
   */
  withTags(...tags: string[]): this {
    this.options.tags = [...(this.options.tags ?? []), ...tags];
    return this;
  }

  /**
   * Set the template as inactive.
   */
  inactive(): this {
    this.options.active = false;
    return this;
  }

  // ============================================================================
  // Function Definition Methods
  // ============================================================================

  /**
   * Add a function definition to the template.
   */
  forFunction(fn: FunctionDefinition): this {
    this.functions.push(fn);
    return this;
  }

  // ============================================================================
  // Authorization Methods
  // ============================================================================

  /**
   * Add a raw authorization rule.
   */
  withAuthorization(rule: AuthorizationRule): this {
    this.verification.authorization = [
      ...(this.verification.authorization ?? []),
      rule,
    ];
    return this;
  }

  /**
   * Require a signature from a specific address.
   */
  requireSignature(signer: string, messageFormat: 'eip191' | 'eip712' | 'raw' = 'eip191'): this {
    const rule: SignatureAuthorization = {
      type: 'signature',
      signer,
      messageFormat,
    };
    return this.withAuthorization(rule);
  }

  /**
   * Require multiple signatures (M-of-N).
   */
  requireMultiSig(signers: string[], requiredSignatures: number, collectionWindow?: number): this {
    const rule: MultiSigAuthorization = {
      type: 'multi-sig',
      signers,
      requiredSignatures,
    };
    if (collectionWindow !== undefined) {
      rule.collectionWindow = collectionWindow;
    }
    return this.withAuthorization(rule);
  }

  /**
   * Require sender to be on whitelist.
   */
  requireWhitelist(addresses: string[]): this {
    const rule: WhitelistAuthorization = {
      type: 'whitelist',
      addresses,
    };
    return this.withAuthorization(rule);
  }

  /**
   * Require sender to hold minimum token balance.
   */
  requireTokenGated(tokenContract: string, minBalance: bigint): this {
    const rule: TokenGatedAuthorization = {
      type: 'token-gated',
      tokenContract,
      minBalance,
    };
    return this.withAuthorization(rule);
  }

  /**
   * Require sender to own an NFT from a collection.
   */
  requireNFTGated(nftContract: string, standard: 'erc721' | 'erc1155' = 'erc721', tokenId?: bigint): this {
    const rule: NFTGatedAuthorization = {
      type: 'nft-gated',
      nftContract,
      standard,
    };
    if (tokenId !== undefined) {
      rule.tokenId = tokenId;
    }
    return this.withAuthorization(rule);
  }

  // ============================================================================
  // Condition Methods
  // ============================================================================

  /**
   * Add a raw state condition.
   */
  withCondition(condition: StateCondition): this {
    this.verification.conditions = [
      ...(this.verification.conditions ?? []),
      condition,
    ];
    return this;
  }

  /**
   * Require minimum token/ETH balance.
   */
  requireBalance(
    token: string,
    value: bigint,
    operator: ComparisonOperator = 'gte',
    account: string | 'sender' = 'sender',
  ): this {
    const condition: BalanceCheckCondition = {
      type: 'balance-check',
      token,
      account,
      operator,
      value,
    };
    return this.withCondition(condition);
  }

  /**
   * Require minimum token allowance.
   */
  requireAllowance(
    token: string,
    spender: string,
    value: bigint,
    owner: string | 'sender' = 'sender',
  ): this {
    const condition: AllowanceCheckCondition = {
      type: 'allowance-check',
      token,
      owner,
      spender,
      operator: 'gte',
      value,
    };
    return this.withCondition(condition);
  }

  // ============================================================================
  // Timing Methods
  // ============================================================================

  /**
   * Add a raw timing rule.
   */
  withTiming(rule: TimingRule): this {
    this.verification.timing = [
      ...(this.verification.timing ?? []),
      rule,
    ];
    return this;
  }

  /**
   * Restrict execution to specific time windows.
   */
  withTimeWindow(
    startHour: number,
    endHour: number,
    allowedDays: DayOfWeek[] = [1, 2, 3, 4, 5],
  ): this {
    const rule: TimeWindowRule = {
      type: 'time-window',
      startHour,
      endHour,
      allowedDays,
    };
    return this.withTiming(rule);
  }

  /**
   * Add cooldown between executions.
   */
  withCooldown(periodSeconds: number, scope: 'global' | 'per-address' | 'per-function' = 'per-address'): this {
    const rule: CooldownRule = {
      type: 'cooldown',
      periodSeconds,
      scope,
    };
    return this.withTiming(rule);
  }

  /**
   * Only allow execution after a timestamp.
   */
  afterTimestamp(timestamp: number): this {
    const rule: AfterTimestampRule = {
      type: 'after-timestamp',
      timestamp,
    };
    return this.withTiming(rule);
  }

  /**
   * Only allow execution before a timestamp.
   */
  beforeTimestamp(timestamp: number): this {
    const rule: BeforeTimestampRule = {
      type: 'before-timestamp',
      timestamp,
    };
    return this.withTiming(rule);
  }

  // ============================================================================
  // Rate Limit Methods
  // ============================================================================

  /**
   * Add a raw rate limit rule.
   */
  withRateLimit(rule: RateLimitRule): this {
    this.verification.rateLimits = [
      ...(this.verification.rateLimits ?? []),
      rule,
    ];
    return this;
  }

  /**
   * Limit executions per address.
   */
  limitPerAddress(maxExecutions: number, windowSeconds: number): this {
    const rule: PerAddressRateLimit = {
      type: 'per-address',
      maxExecutions,
      windowSeconds,
      addressType: 'sender',
    };
    return this.withRateLimit(rule);
  }

  /**
   * Limit total value per time period.
   */
  limitValue(token: string, maxValue: bigint, windowSeconds: number, scope: 'global' | 'per-address' = 'per-address'): this {
    const rule: ValueRateLimit = {
      type: 'value-limit',
      token,
      maxValue,
      windowSeconds,
      scope,
    };
    return this.withRateLimit(rule);
  }

  // ============================================================================
  // Staking Methods
  // ============================================================================

  /**
   * Add a raw staking rule.
   */
  withStaking(rule: StakingRule): this {
    this.verification.staking = [
      ...(this.verification.staking ?? []),
      rule,
    ];
    return this;
  }

  /**
   * Require a fixed stake amount.
   */
  requireStake(
    token: string,
    amount: bigint,
    stakingContract: string,
    lockPeriod: number = 0,
    slashable: boolean = false,
  ): this {
    const rule: FixedStakeRule = {
      type: 'fixed-stake',
      token,
      amount,
      stakingContract,
      lockPeriod,
      slashable,
    };
    return this.withStaking(rule);
  }

  // ============================================================================
  // Execution Mode Methods
  // ============================================================================

  /**
   * Set raw execution mode.
   */
  withExecutionMode(mode: ExecutionMode): this {
    this.execution.mode = mode;
    return this;
  }

  /**
   * Execute immediately.
   */
  immediate(confirmations?: number): this {
    const mode: ImmediateExecutionMode = {
      type: 'immediate',
      waitForConfirmation: confirmations !== undefined,
    };
    if (confirmations !== undefined) {
      mode.confirmations = confirmations;
    }
    return this.withExecutionMode(mode);
  }

  /**
   * Execute after a delay.
   */
  delayed(delaySeconds: number, cancellable: boolean = true): this {
    const mode: DelayedExecutionMode = {
      type: 'delayed',
      delaySeconds,
      cancellable,
    };
    return this.withExecutionMode(mode);
  }

  /**
   * Execute optimistically with challenge period.
   */
  optimistic(challengePeriodSeconds: number, challengeBond?: bigint): this {
    const mode: OptimisticExecutionMode = {
      type: 'optimistic',
      challengePeriodSeconds,
    };
    if (challengeBond !== undefined) {
      mode.challengeBond = challengeBond;
    }
    return this.withExecutionMode(mode);
  }

  /**
   * Set gas limit.
   */
  withGasLimit(gasLimit: bigint): this {
    this.execution.gasLimit = gasLimit;
    return this;
  }

  /**
   * Set confirmations required.
   */
  withConfirmations(confirmations: number): this {
    this.execution.confirmations = confirmations;
    return this;
  }

  // ============================================================================
  // Monitoring Methods
  // ============================================================================

  /**
   * Set logging level.
   */
  withLogging(level: LoggingLevel): this {
    this.monitoring.loggingLevel = level;
    return this;
  }

  /**
   * Enable on-chain proof storage.
   */
  storeProofs(): this {
    this.monitoring.storeProofs = true;
    return this;
  }

  /**
   * Set webhook URL for notifications.
   */
  withWebhook(url: string): this {
    this.monitoring.webhookUrl = url;
    return this;
  }

  // ============================================================================
  // Build Method
  // ============================================================================

  /**
   * Build the template.
   *
   * @returns The completed InvarianceTemplate
   * @throws Error if required fields are missing
   */
  build(): InvarianceTemplate {
    // Generate template ID if not set
    if (!this.options.templateId) {
      this.options.templateId = `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` as TemplateId;
    }

    // Validate required fields
    if (!this.options.name) {
      throw new Error('Template name is required');
    }

    // Set default execution mode if not specified
    if (!this.execution.mode) {
      this.execution.mode = { type: 'immediate' };
    }

    // Set default logging level if not specified
    if (!this.monitoring.loggingLevel) {
      this.monitoring.loggingLevel = 'info';
    }

    return {
      options: this.options as TemplateOptions,
      functions: this.functions,
      verification: this.verification as VerificationRules,
      execution: this.execution as ExecutionConfig,
      monitoring: this.monitoring as MonitoringConfig,
    };
  }
}
