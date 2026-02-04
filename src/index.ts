/**
 * @invariance/sdk
 *
 * TypeScript SDK for Invariance Protocol - secure execution layer for autonomous agents.
 *
 * @example
 * ```typescript
 * import { Invariance } from '@invariance/sdk';
 *
 * const inv = new Invariance({
 *   chainId: 8453, // Base mainnet
 *   rpcUrl: process.env.RPC_URL,
 * });
 *
 * // Wrap agent execution with verification
 * inv.beforeExecution(async (action) => {
 *   // SDK handles: permission check, serialization, signing, logging
 * });
 * ```
 *
 * @packageDocumentation
 */

// Re-export common types
export type {
  AgentId,
  ActionId,
  TaskId,
  Action,
  ActionInput,
  ActionResult,
  Permission,
  PermissionType,
  SpendingCapPermission,
  TimeWindowPermission,
  ActionWhitelistPermission,
  AnyPermission,
  PermissionConfig,
  PermissionCheckResult,
} from '@invariance/common';

// Export main client
export { Invariance } from './client.js';
export type { InvarianceConfig } from './client.js';

// Export core modules
export { Verifier } from './core/verifier.js';
export { Serializer } from './core/serializer.js';

// Export permission templates
export { SpendingCap } from './permissions/spending-cap.js';
export { TimeWindow } from './permissions/time-window.js';
export { ActionWhitelist } from './permissions/action-whitelist.js';

// Export wallet adapters
export type { WalletAdapter } from './wallet/types.js';
export { PrivyWallet } from './wallet/privy.js';
export { LocalWallet } from './wallet/local.js';

// Export errors
export { InvarianceError } from './errors/base.js';
export { PermissionDeniedError } from './errors/permission-denied.js';
export { StateFailedError } from './errors/state-failed.js';
