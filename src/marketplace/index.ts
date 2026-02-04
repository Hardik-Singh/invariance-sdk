/**
 * Invariance Permission Marketplace Module
 *
 * This module provides tools for interacting with the custom permission marketplace:
 * - MarketplaceClient: Browse, enable, and disable community permissions
 * - CustomPermissionDeployer: Deploy custom permission contracts
 *
 * @example
 * ```typescript
 * import { MarketplaceClient, CustomPermissionDeployer } from '@invariance/sdk';
 * import { getContractAddresses } from '@invariance/common';
 *
 * // Set up marketplace client
 * const marketplace = new MarketplaceClient({
 *   addresses: getContractAddresses(8453),
 *   rpcUrl: 'https://mainnet.base.org',
 *   wallet: myWallet,
 * });
 *
 * // Browse permissions
 * const permissions = await marketplace.listPermissions({ verifiedOnly: true });
 *
 * // Enable a permission
 * await marketplace.enablePermission({
 *   permissionId: permissions[0].permissionId,
 *   gasBudget: 100000n,
 * });
 *
 * // Deploy custom permission
 * const deployer = new CustomPermissionDeployer({
 *   addresses: getContractAddresses(8453),
 *   rpcUrl: 'https://mainnet.base.org',
 *   wallet: myWallet,
 * });
 *
 * const { permissionId } = await deployer.deployFromTemplate('max-daily-spend', {
 *   maxDaily: 10_000_000_000_000_000_000n,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client for browsing and managing permissions
export { MarketplaceClient } from './client.js';
export type {
  MarketplaceClientOptions,
  TransactionResult,
} from './client.js';

// Deployer for creating custom permissions
export { CustomPermissionDeployer } from './deployer.js';
export type {
  DeployerOptions,
  TemplateCompilationResult,
} from './deployer.js';

// Re-export types from common for convenience
export type {
  CustomPermissionId,
  CustomPermissionMetadata,
  CustomPermissionConfig,
  AgentPermissionConfig,
  ListPermissionsOptions,
  CustomPermissionCheckResult,
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
  TemplateConfig,
  MarketplaceEvent,
  PermissionRegisteredEvent,
  PermissionVersionUpdatedEvent,
  PermissionEnabledEvent,
  PermissionDisabledEvent,
} from '@invariance/common';

// Re-export create function
export { createCustomPermissionId } from '@invariance/common';
