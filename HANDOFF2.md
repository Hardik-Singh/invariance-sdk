# Handoff Document: Permission → Policy Refactoring

## Summary

This document covers the completed refactoring of "Permission Templates" to "Execution Policies" across the Invariance SDK and common packages. The work implements the plan from the feature/permission-templates branch.

## Completed Work

### Phase 1: Terminology Rename (Foundation) ✅

**packages/common/src/types/policies.ts** (NEW)
- Created new `policies.ts` with all renamed types
- `Permission` → `Policy`
- `PermissionType` → `PolicyType`
- `SpendingCapPermission` → `SpendingCapPolicy`
- `TimeWindowPermission` → `TimeWindowPolicy`
- `ActionWhitelistPermission` → `ActionWhitelistPolicy`
- `VotingPermission` → `VotingPolicy`
- `HumanApprovalPermission` → `HumanApprovalPolicy`
- `AnyPermission` → `AnyPolicy`
- `PermissionConfig` → `PolicyConfig`
- `PermissionCheckResult` → `PolicyCheckResult`
- Added new types: `ActorType`, `ActionCategory`
- Added new base policy fields: `version`, `maxGas`, `maxValue`, `allowedActors`, `category`, `cooldownSeconds`
- All deprecated type aliases included for backward compatibility

**packages/common/src/types/index.ts** ✅
- Updated to export from `policies.js` instead of `permissions.js`
- Added export for `custom-permissions.js`
- Removed old `permissions.ts` file

**packages/common/src/defaults/policy-defaults.ts** (NEW) ✅
- `DEFAULT_POLICY_VALUES` with sensible defaults
- `MAX_UINT256` constant
- `applyPolicyDefaults()` helper function

### Phase 2: New Policy Fields (Core Schema) ✅

All policy interfaces now include:
```typescript
interface Policy {
  id: string;
  type: PolicyType;
  active: boolean;
  version: string;              // "1.0.0"
  maxGas: bigint;               // 5_000_000n
  maxValue: bigint;             // MAX_UINT256
  allowedActors: ActorType[];   // ['any']
  category: ActionCategory;     // 'CUSTOM'
  cooldownSeconds: number;      // 300
}
```

### Phase 3: Execution Intent & Logging ✅

**packages/common/src/types/actions.ts**
- Added `IntentHash` branded type
- Added `ActionResultWithProvenance` interface
- Added `createIntentHash()` helper

**packages/common/src/types/events.ts**
- Updated `ActionLoggedEvent` with new fields (intentHash, policyHash, policyVersion, category, valueMoved, gasUsed)
- Added `ActionSummarizedEvent`
- Added `PolicyDeniedEvent` (with deprecated `PermissionDeniedEvent`)

**sdk/src/core/intent.ts** (NEW)
- `generateIntentHash()` - creates intent hash from action + policyHash
- `generatePolicyHash()` - creates hash from policy config
- `generateRuntimeFingerprint()` - creates SDK + agent code fingerprint

### Phase 4: SDK Execution Enhancements ✅

**sdk/src/policies/** (NEW directory, replaces permissions/)
- `types.ts` - `ExecutionPolicy`, `AsyncExecutionPolicy`, `isAsyncPolicy()`
- `spending-cap.ts` - Updated with new fields, `toPolicy()` method
- `time-window.ts` - Updated with new fields, `toPolicy()` method
- `action-whitelist.ts` - Updated with new fields, `toPolicy()` method
- `voting.ts` - Updated with new fields, `toPolicy()` method
- `human-approval.ts` - Updated with new fields, `toPolicy()` method
- `index.ts` - Exports all policies

**sdk/src/core/cooldown-tracker.ts** (NEW)
- `CooldownTracker` class for tracking action cooldowns per actor/category

**sdk/src/core/verifier.ts** (UPDATED)
- Added `SpendingStateProvider` interface for stateless operation
- Added `checkPolicy()` method (with `checkPermission()` as deprecated alias)
- Added `checkTemplatePolicy()` method
- Made verifier support both stateless (via provider) and stateful modes

**sdk/src/client.ts** (UPDATED)
- Config now accepts `policies` (with `permissions` as deprecated)
- Added `simulateExecute()` method
- Added `onAnomalyCheck()` for anomaly detection hooks
- Added `recordExecution()` for tracking
- Added runtime fingerprint support (`enableFingerprint`, `agentCodeHash`)
- Added `SDK_VERSION` constant
- New types: `SimulationResult`, `AnomalyResult`, `ExecutionContext`, etc.

**sdk/src/errors/policy-denied.ts** (NEW, replaces permission-denied.ts)
- `PolicyDeniedError` class
- `PermissionDeniedError` as deprecated alias

### Phase 5: Contract Interface Updates ✅

**sdk/src/contracts/policy-gate.ts** (NEW, replaces permission-gate.ts)
- `PolicyGateContract` interface with `checkPolicy()` and `getCooldownRemaining()`
- `PolicyGate` class
- Deprecated `PermissionGate` alias

**sdk/src/contracts/core.ts** (UPDATED)
- `registerAgent()` now takes `policyHash` and `policyVersion`
- Added `logAction()` method with intent hash, category, value, gas

**sdk/src/contracts/permission-registry.ts** (NEW)
- `PermissionRegistryContract` interface for marketplace
- `PermissionRegistry` class for custom permission management

**sdk/src/index.ts** (UPDATED)
- All new exports added
- Marketplace exports added
- Backward compatibility aliases included

### Phase 6: Permission Marketplace ✅

**sdk/src/marketplace/client.ts** (NEW)
- `MarketplaceClient` class for browsing and managing permissions
- `listPermissions()`, `getPermission()`, `getFeaturedPermissions()`
- `enablePermission()`, `disablePermission()`
- `checkPermissions()`, `checkPermission()`

**sdk/src/marketplace/deployer.ts** (NEW)
- `CustomPermissionDeployer` class for deploying permissions
- `deployFromTemplate()` with 8 built-in templates
- `getAvailableTemplates()`, `getTemplateInfo()`

**sdk/src/marketplace/index.ts** (NEW)
- Exports all marketplace functionality
- Re-exports types from common

**packages/common/src/types/custom-permissions.ts** (NEW)
- `CustomPermissionId` branded type
- `CustomPermissionMetadata`, `CustomPermissionConfig`, `AgentPermissionConfig`
- `ListPermissionsOptions`, `CustomPermissionCheckResult`
- `DeployPermissionOptions`, `DeployPermissionResult`, `DeployFromTemplateOptions`
- `BuiltInTemplateType` and all template config types
- Marketplace event types

### Phase 7: Tests & Documentation ✅

**Tests Updated:**
- `sdk/test/client.test.ts` - Fixed imports from `permissions/` to `policies/`
- `sdk/test/voting.test.ts` - Fixed imports from `permissions/` to `policies/`
- `sdk/test/human-approval.test.ts` - Fixed imports from `permissions/` to `policies/`
- `sdk/test/verifier.test.ts` - Updated to use `PolicyConfig` with `policies` field

**Documentation Updated:**
- `sdk/README.md` - Complete rewrite with new terminology and marketplace docs
- `sdk/CHANGELOG.md` - Full changelog with all changes
- `sdk/HANDOFF2.md` - This document (updated to reflect completion)

## File Changes Summary

### New Files
- `packages/common/src/types/policies.ts`
- `packages/common/src/types/custom-permissions.ts`
- `packages/common/src/defaults/policy-defaults.ts`
- `packages/common/src/defaults/index.ts`
- `sdk/src/policies/types.ts`
- `sdk/src/policies/spending-cap.ts`
- `sdk/src/policies/time-window.ts`
- `sdk/src/policies/action-whitelist.ts`
- `sdk/src/policies/voting.ts`
- `sdk/src/policies/human-approval.ts`
- `sdk/src/policies/index.ts`
- `sdk/src/core/intent.ts`
- `sdk/src/core/cooldown-tracker.ts`
- `sdk/src/errors/policy-denied.ts`
- `sdk/src/contracts/policy-gate.ts`
- `sdk/src/contracts/permission-registry.ts`
- `sdk/src/marketplace/client.ts`
- `sdk/src/marketplace/deployer.ts`
- `sdk/src/marketplace/index.ts`

### Deleted Files
- `packages/common/src/types/permissions.ts`
- `sdk/src/permissions/` (entire directory)
- `sdk/src/errors/permission-denied.ts`
- `sdk/src/contracts/permission-gate.ts`

### Modified Files
- `packages/common/src/types/index.ts`
- `packages/common/src/types/actions.ts`
- `packages/common/src/types/events.ts`
- `packages/common/src/constants/contracts.ts`
- `packages/common/src/index.ts`
- `sdk/src/core/verifier.ts`
- `sdk/src/client.ts`
- `sdk/src/contracts/core.ts`
- `sdk/src/contracts/escrow.ts`
- `sdk/src/contracts/execution-log.ts`
- `sdk/src/wallet/local.ts`
- `sdk/src/wallet/privy.ts`
- `sdk/src/index.ts`
- `sdk/test/client.test.ts`
- `sdk/test/voting.test.ts`
- `sdk/test/human-approval.test.ts`
- `sdk/test/verifier.test.ts`

## Backward Compatibility

All deprecated items have aliases that will work for 2 major versions:
- Type aliases in `policies.ts`
- Method aliases (`checkPermission` → `checkPolicy`)
- Class aliases (`PermissionDeniedError`, `PermissionGate`)
- Config field migration (`permissions` → `policies` with console warning)

## Build & Test Verification

```bash
# Build common package
cd packages/common && pnpm build
# ✅ Builds successfully

# Build SDK
cd ../sdk && pnpm build
# ✅ Builds successfully

# Run tests
pnpm test -- --run
# ✅ 88 tests passing
```

## Key Design Decisions

1. **Cooldown default**: 5 minutes (300s) between same-category actions
2. **Actor types**: Default to `['any']` - no restrictions by default
3. **Runtime fingerprint**: Opt-in for privacy
4. **Stateless verifier**: Supports external state provider for spending tracking
5. **Action categories**: TRANSFER, SWAP, APPROVE, CALL, BRIDGE, CUSTOM
6. **Marketplace templates**: 8 built-in templates for common use cases
7. **Contract addresses**: `permissionRegistry` added to `ContractAddresses` interface

## Ready for Merge

The `feature/permission-templates` branch is now ready to merge to main:
- All TypeScript errors resolved
- All 88 tests passing
- Build succeeds
- Documentation updated
- Backward compatibility maintained
