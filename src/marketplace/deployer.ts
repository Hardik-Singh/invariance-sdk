import type { ContractAddresses } from '@invariance/common';
import type {
  DeployPermissionOptions,
  DeployPermissionResult,
  DeployFromTemplateOptions,
  BuiltInTemplateType,
  MaxDailySpendConfig,
  AddressWhitelistConfig,
  AddressBlacklistConfig,
  TimeRestrictedConfig,
  ActionTypeFilterConfig,
  ValueThresholdConfig,
  RateLimiterConfig,
  CooldownEnforcerConfig,
} from '@invariance/common';
import type { WalletAdapter } from '../wallet/types.js';
import { PermissionRegistry } from '../contracts/permission-registry.js';
import { InvarianceError } from '../errors/base.js';

/**
 * Options for initializing the deployer.
 */
export interface DeployerOptions {
  /** Contract addresses */
  addresses: ContractAddresses;
  /** RPC URL for blockchain communication */
  rpcUrl: string;
  /** Wallet adapter for signing transactions */
  wallet: WalletAdapter;
}

/**
 * Result of template compilation.
 */
export interface TemplateCompilationResult {
  /** Compiled bytecode */
  bytecode: string;
  /** Constructor arguments (ABI encoded) */
  constructorArgs: string;
  /** Template metadata */
  metadata: {
    name: string;
    description: string;
    version: string;
    tags: string[];
  };
}

/**
 * Deploys custom permission contracts to the blockchain and registers them
 * in the marketplace.
 *
 * The deployer supports two modes:
 * 1. **Direct deployment**: Deploy pre-compiled bytecode
 * 2. **Template deployment**: Use built-in templates with configuration
 *
 * @example
 * ```typescript
 * const deployer = new CustomPermissionDeployer({
 *   addresses: getContractAddresses(8453),
 *   rpcUrl: 'https://mainnet.base.org',
 *   wallet: myWallet,
 * });
 *
 * // Deploy from template
 * const { permissionId } = await deployer.deployFromTemplate('max-daily-spend', {
 *   maxDaily: 10_000_000_000_000_000_000n, // 10 ETH
 * });
 *
 * // Or deploy custom bytecode
 * const result = await deployer.deploy({
 *   name: 'My Custom Permission',
 *   description: 'Checks something custom',
 *   version: '1.0.0',
 *   tags: ['custom', 'my-tag'],
 *   bytecode: '0x...',
 * });
 * ```
 */
export class CustomPermissionDeployer {
  /** @internal */
  readonly registry: PermissionRegistry;
  /** @internal */
  readonly rpcUrl: string;
  /** @internal */
  readonly wallet: WalletAdapter;
  /** @internal */
  readonly addresses: ContractAddresses;

  constructor(options: DeployerOptions) {
    if (!options.wallet) {
      throw new InvarianceError('Wallet required for deployer');
    }
    this.addresses = options.addresses;
    this.registry = new PermissionRegistry(options.addresses, options.rpcUrl);
    this.rpcUrl = options.rpcUrl;
    this.wallet = options.wallet;
  }

  // ============================================================================
  // Direct Deployment
  // ============================================================================

  /**
   * Deploy a custom permission contract from bytecode.
   *
   * @param options - Deployment options including bytecode
   * @returns Deployment result with permission ID and contract address
   *
   * @example
   * ```typescript
   * const result = await deployer.deploy({
   *   name: 'Token Gate',
   *   description: 'Requires holding specific tokens',
   *   version: '1.0.0',
   *   tags: ['token', 'gating'],
   *   bytecode: compiledBytecode,
   *   constructorArgs: encodedArgs,
   * });
   * ```
   */
  async deploy(options: DeployPermissionOptions): Promise<DeployPermissionResult> {
    // Validate options
    this.validateDeployOptions(options);

    // Deploy contract
    // TODO: Implement actual contract deployment
    // 1. Combine bytecode with constructor args
    // 2. Send deployment transaction
    // 3. Wait for receipt
    // 4. Get deployed address
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const deployTx = this.buildDeployTransaction(options.bytecode, options.constructorArgs);
    void deployTx; // Silence unused variable warning until implemented

    // For now, throw not implemented
    throw new Error('Direct deployment not yet implemented. Use deployFromTemplate instead.');
  }

  // ============================================================================
  // Template Deployment
  // ============================================================================

  /**
   * Deploy a permission from a built-in template.
   *
   * @param templateName - Name of the template
   * @param config - Template-specific configuration
   * @returns Deployment result
   *
   * @example
   * ```typescript
   * // Deploy max daily spend permission
   * const result = await deployer.deployFromTemplate('max-daily-spend', {
   *   maxDaily: 5_000_000_000_000_000_000n, // 5 ETH
   *   token: '0x0000000000000000000000000000000000000000', // Native ETH
   * });
   *
   * // Deploy address whitelist
   * const result2 = await deployer.deployFromTemplate('address-whitelist', {
   *   addresses: ['0x...', '0x...'],
   *   checkField: 'recipient',
   * });
   * ```
   */
  async deployFromTemplate(
    templateName: BuiltInTemplateType,
    config: Record<string, unknown>,
    options?: Partial<DeployFromTemplateOptions>
  ): Promise<DeployPermissionResult> {
    // Get template compilation result
    const compilation = this.compileTemplate(templateName, config);

    // Merge with options
    const name = options?.name ?? compilation.metadata.name;
    const description = options?.description ?? compilation.metadata.description;
    const tags = options?.tags ?? compilation.metadata.tags;

    // Deploy
    return this.deploy({
      name,
      description,
      version: compilation.metadata.version,
      tags,
      bytecode: compilation.bytecode,
      constructorArgs: compilation.constructorArgs,
    });
  }

  /**
   * Get available template names.
   */
  getAvailableTemplates(): BuiltInTemplateType[] {
    return [
      'max-daily-spend',
      'address-whitelist',
      'address-blacklist',
      'time-restricted',
      'action-type-filter',
      'value-threshold',
      'rate-limiter',
      'cooldown-enforcer',
    ];
  }

  /**
   * Get template description and required configuration.
   */
  getTemplateInfo(templateName: BuiltInTemplateType): {
    name: string;
    description: string;
    configSchema: Record<string, { type: string; required: boolean; description: string }>;
  } {
    switch (templateName) {
      case 'max-daily-spend':
        return {
          name: 'Max Daily Spend',
          description: 'Limits the total amount that can be spent per day',
          configSchema: {
            maxDaily: {
              type: 'bigint',
              required: true,
              description: 'Maximum amount per day (in wei)',
            },
            token: {
              type: 'string',
              required: false,
              description: 'Token address (0x0 for native ETH)',
            },
          },
        };
      case 'address-whitelist':
        return {
          name: 'Address Whitelist',
          description: 'Only allows transactions to whitelisted addresses',
          configSchema: {
            addresses: {
              type: 'string[]',
              required: true,
              description: 'Whitelisted addresses',
            },
            checkField: {
              type: "'recipient' | 'sender' | 'both'",
              required: true,
              description: 'Which address field to check',
            },
          },
        };
      case 'address-blacklist':
        return {
          name: 'Address Blacklist',
          description: 'Blocks transactions to blacklisted addresses',
          configSchema: {
            addresses: {
              type: 'string[]',
              required: true,
              description: 'Blacklisted addresses',
            },
            checkField: {
              type: "'recipient' | 'sender' | 'both'",
              required: true,
              description: 'Which address field to check',
            },
          },
        };
      case 'time-restricted':
        return {
          name: 'Time Restricted',
          description: 'Only allows actions during specific hours/days',
          configSchema: {
            startHour: {
              type: 'number',
              required: true,
              description: 'Start hour (0-23, UTC)',
            },
            endHour: {
              type: 'number',
              required: true,
              description: 'End hour (0-23, UTC)',
            },
            allowedDays: {
              type: 'number[]',
              required: false,
              description: 'Allowed days (0=Sunday, 6=Saturday)',
            },
          },
        };
      case 'action-type-filter':
        return {
          name: 'Action Type Filter',
          description: 'Filters allowed action types by pattern',
          configSchema: {
            allowedPatterns: {
              type: 'string[]',
              required: true,
              description: 'Allowed action type patterns',
            },
            isBlocklist: {
              type: 'boolean',
              required: false,
              description: 'Use as blocklist instead of allowlist',
            },
          },
        };
      case 'value-threshold':
        return {
          name: 'Value Threshold',
          description: 'Limits maximum value per transaction',
          configSchema: {
            maxValue: {
              type: 'bigint',
              required: true,
              description: 'Maximum value per transaction (in wei)',
            },
            token: {
              type: 'string',
              required: false,
              description: 'Token address (0x0 for native ETH)',
            },
          },
        };
      case 'rate-limiter':
        return {
          name: 'Rate Limiter',
          description: 'Limits number of actions in a time window',
          configSchema: {
            maxActions: {
              type: 'number',
              required: true,
              description: 'Maximum number of actions',
            },
            windowSeconds: {
              type: 'number',
              required: true,
              description: 'Time window in seconds',
            },
            perActionType: {
              type: 'boolean',
              required: false,
              description: 'Track per action type',
            },
          },
        };
      case 'cooldown-enforcer':
        return {
          name: 'Cooldown Enforcer',
          description: 'Enforces cooldown between actions',
          configSchema: {
            cooldownSeconds: {
              type: 'number',
              required: true,
              description: 'Cooldown period in seconds',
            },
            actionTypes: {
              type: 'string[]',
              required: false,
              description: 'Action types this applies to (empty = all)',
            },
          },
        };
      default:
        throw new InvarianceError(`Unknown template: ${templateName}`);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Validate deployment options.
   */
  private validateDeployOptions(options: DeployPermissionOptions): void {
    if (!options.name || options.name.length === 0) {
      throw new InvarianceError('Permission name is required');
    }
    if (!options.description || options.description.length === 0) {
      throw new InvarianceError('Permission description is required');
    }
    if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
      throw new InvarianceError('Valid semver version is required (e.g., 1.0.0)');
    }
    if (!options.bytecode || !options.bytecode.startsWith('0x')) {
      throw new InvarianceError('Valid bytecode is required (0x prefixed)');
    }
  }

  /**
   * Compile a template into deployable bytecode.
   */
  private compileTemplate(
    templateName: BuiltInTemplateType,
    config: Record<string, unknown>
  ): TemplateCompilationResult {
    // Validate config for template
    this.validateTemplateConfig(templateName, config);

    // Get template bytecode and encode constructor args
    switch (templateName) {
      case 'max-daily-spend':
        return this.compileMaxDailySpend(config as unknown as MaxDailySpendConfig);
      case 'address-whitelist':
        return this.compileAddressWhitelist(config as unknown as AddressWhitelistConfig);
      case 'address-blacklist':
        return this.compileAddressBlacklist(config as unknown as AddressBlacklistConfig);
      case 'time-restricted':
        return this.compileTimeRestricted(config as unknown as TimeRestrictedConfig);
      case 'action-type-filter':
        return this.compileActionTypeFilter(config as unknown as ActionTypeFilterConfig);
      case 'value-threshold':
        return this.compileValueThreshold(config as unknown as ValueThresholdConfig);
      case 'rate-limiter':
        return this.compileRateLimiter(config as unknown as RateLimiterConfig);
      case 'cooldown-enforcer':
        return this.compileCooldownEnforcer(config as unknown as CooldownEnforcerConfig);
      default:
        throw new InvarianceError(`Unknown template: ${templateName}`);
    }
  }

  /**
   * Validate template configuration.
   */
  private validateTemplateConfig(
    templateName: BuiltInTemplateType,
    config: Record<string, unknown>
  ): void {
    const info = this.getTemplateInfo(templateName);
    for (const [key, schema] of Object.entries(info.configSchema)) {
      if (schema.required && config[key] === undefined) {
        throw new InvarianceError(`Missing required config: ${key}`);
      }
    }
  }

  /**
   * Build deployment transaction data.
   */
  private buildDeployTransaction(
    bytecode: string,
    constructorArgs?: string
  ): { data: string } {
    let data = bytecode;
    if (constructorArgs) {
      // Remove 0x prefix from constructor args and append
      const args = constructorArgs.startsWith('0x')
        ? constructorArgs.slice(2)
        : constructorArgs;
      data = bytecode + args;
    }
    return { data };
  }

  // Template compilation methods (stubs - actual bytecode would come from compiled contracts)

  private compileMaxDailySpend(config: MaxDailySpendConfig): TemplateCompilationResult {
    // TODO: Include actual compiled bytecode for MaxDailySpend template
    const token = config.token ?? '0x0000000000000000000000000000000000000000';
    return {
      bytecode: '0x', // Placeholder - actual bytecode from compiled Solidity
      constructorArgs: this.encodeConstructorArgs(['uint256', 'address'], [config.maxDaily, token]),
      metadata: {
        name: 'Max Daily Spend',
        description: `Limits daily spending to ${config.maxDaily.toString()} wei`,
        version: '1.0.0',
        tags: ['spending', 'limit', 'daily'],
      },
    };
  }

  private compileAddressWhitelist(config: AddressWhitelistConfig): TemplateCompilationResult {
    return {
      bytecode: '0x',
      constructorArgs: this.encodeConstructorArgs(
        ['address[]', 'uint8'],
        [config.addresses, this.checkFieldToUint(config.checkField)]
      ),
      metadata: {
        name: 'Address Whitelist',
        description: `Whitelist of ${config.addresses.length} addresses`,
        version: '1.0.0',
        tags: ['whitelist', 'address', 'filter'],
      },
    };
  }

  private compileAddressBlacklist(config: AddressBlacklistConfig): TemplateCompilationResult {
    return {
      bytecode: '0x',
      constructorArgs: this.encodeConstructorArgs(
        ['address[]', 'uint8'],
        [config.addresses, this.checkFieldToUint(config.checkField)]
      ),
      metadata: {
        name: 'Address Blacklist',
        description: `Blacklist of ${config.addresses.length} addresses`,
        version: '1.0.0',
        tags: ['blacklist', 'address', 'filter'],
      },
    };
  }

  private compileTimeRestricted(config: TimeRestrictedConfig): TemplateCompilationResult {
    const days = config.allowedDays ?? [0, 1, 2, 3, 4, 5, 6];
    return {
      bytecode: '0x',
      constructorArgs: this.encodeConstructorArgs(
        ['uint8', 'uint8', 'uint8[]'],
        [config.startHour, config.endHour, days]
      ),
      metadata: {
        name: 'Time Restricted',
        description: `Active ${config.startHour}:00 - ${config.endHour}:00 UTC`,
        version: '1.0.0',
        tags: ['time', 'schedule', 'window'],
      },
    };
  }

  private compileActionTypeFilter(config: ActionTypeFilterConfig): TemplateCompilationResult {
    return {
      bytecode: '0x',
      constructorArgs: this.encodeConstructorArgs(
        ['string[]', 'bool'],
        [config.allowedPatterns, config.isBlocklist ?? false]
      ),
      metadata: {
        name: config.isBlocklist ? 'Action Type Blocklist' : 'Action Type Allowlist',
        description: `${config.isBlocklist ? 'Blocks' : 'Allows'} ${config.allowedPatterns.length} action patterns`,
        version: '1.0.0',
        tags: ['action', 'filter', config.isBlocklist ? 'blocklist' : 'allowlist'],
      },
    };
  }

  private compileValueThreshold(config: ValueThresholdConfig): TemplateCompilationResult {
    const token = config.token ?? '0x0000000000000000000000000000000000000000';
    return {
      bytecode: '0x',
      constructorArgs: this.encodeConstructorArgs(['uint256', 'address'], [config.maxValue, token]),
      metadata: {
        name: 'Value Threshold',
        description: `Max ${config.maxValue.toString()} wei per transaction`,
        version: '1.0.0',
        tags: ['value', 'threshold', 'limit'],
      },
    };
  }

  private compileRateLimiter(config: RateLimiterConfig): TemplateCompilationResult {
    return {
      bytecode: '0x',
      constructorArgs: this.encodeConstructorArgs(
        ['uint256', 'uint256', 'bool'],
        [config.maxActions, config.windowSeconds, config.perActionType ?? false]
      ),
      metadata: {
        name: 'Rate Limiter',
        description: `Max ${config.maxActions} actions per ${config.windowSeconds}s`,
        version: '1.0.0',
        tags: ['rate', 'limit', 'throttle'],
      },
    };
  }

  private compileCooldownEnforcer(config: CooldownEnforcerConfig): TemplateCompilationResult {
    const actionTypes = config.actionTypes ?? [];
    return {
      bytecode: '0x',
      constructorArgs: this.encodeConstructorArgs(
        ['uint256', 'string[]'],
        [config.cooldownSeconds, actionTypes]
      ),
      metadata: {
        name: 'Cooldown Enforcer',
        description: `${config.cooldownSeconds}s cooldown between actions`,
        version: '1.0.0',
        tags: ['cooldown', 'delay', 'throttle'],
      },
    };
  }

  private checkFieldToUint(checkField: 'recipient' | 'sender' | 'both'): number {
    switch (checkField) {
      case 'recipient':
        return 0;
      case 'sender':
        return 1;
      case 'both':
        return 2;
    }
  }

  private encodeConstructorArgs(_types: string[], _values: unknown[]): string {
    // TODO: Implement proper ABI encoding
    // For now, return empty string as this requires ethers/viem
    return '0x';
  }
}
