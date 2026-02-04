# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Permission Marketplace
- `MarketplaceClient` for browsing, enabling, and disabling community permissions
- `CustomPermissionDeployer` for deploying custom permission contracts from templates
- `PermissionRegistry` contract wrapper for marketplace interactions
- Built-in templates: `max-daily-spend`, `address-whitelist`, `address-blacklist`, `time-restricted`, `action-type-filter`, `value-threshold`, `rate-limiter`, `cooldown-enforcer`
- New types: `CustomPermissionId`, `CustomPermissionMetadata`, `CustomPermissionConfig`, `AgentPermissionConfig`, `ListPermissionsOptions`, `CustomPermissionCheckResult`
- Marketplace event types: `PermissionRegisteredEvent`, `PermissionVersionUpdatedEvent`, `PermissionEnabledEvent`, `PermissionDisabledEvent`

#### Template System
- `TemplateVerifier` for advanced verification against templates
- `BaseTemplate` class for building custom templates
- `TemplateRegistry` and `TemplateBuilder` utilities
- `TemplateValidator` for validating template configurations
- Prebuilt templates: `createSimpleTransferTemplate`, `createMultisigTransferTemplate`, `createTradingAgentTemplate`, `createDAOGovernedTemplate`, `createNFTGatedTemplate`

#### Execution Policies (renamed from Permission Templates)
- `Voting` policy for multi-sig, DAO, and threshold voting
- `HumanApproval` policy for human-in-the-loop confirmation
- New policy fields: `version`, `maxGas`, `maxValue`, `allowedActors`, `category`, `cooldownSeconds`
- `CooldownTracker` for tracking action cooldowns
- `PolicyDeniedError` (replaces `PermissionDeniedError`)
- `PolicyGate` contract wrapper (replaces `PermissionGate`)

#### Intent & Execution Tracking
- `generateIntentHash()` for creating action intent hashes
- `generatePolicyHash()` for creating policy configuration hashes
- `generateRuntimeFingerprint()` for SDK/agent code fingerprinting
- `simulateExecute()` method on `Invariance` client
- `ActionResultWithProvenance` type with full execution context
- Enhanced `ActionLoggedEvent` with intent hash, policy hash, category, and gas tracking

#### Stateless Operation
- `SpendingStateProvider` interface for external spending state
- `Verifier.setSpendingProvider()` for stateless operation mode

### Changed

- Renamed "Permission" terminology to "Policy" throughout the codebase
  - `Permission` → `Policy`
  - `PermissionConfig` → `PolicyConfig`
  - `SpendingCapPermission` → `SpendingCapPolicy`
  - `TimeWindowPermission` → `TimeWindowPolicy`
  - `ActionWhitelistPermission` → `ActionWhitelistPolicy`
  - `VotingPermission` → `VotingPolicy`
  - `HumanApprovalPermission` → `HumanApprovalPolicy`
  - `checkPermission()` → `checkPolicy()` (on Verifier)
- Moved policy implementations from `src/permissions/` to `src/policies/`
- `InvarianceConfig.permissions` renamed to `InvarianceConfig.policies`
- Contract wrappers now expose `contractAddress` and `rpcUrl` as public readonly properties

### Deprecated

- `Permission` type (use `Policy`)
- `PermissionConfig` type (use `PolicyConfig`)
- `SpendingCapPermission` type (use `SpendingCapPolicy`)
- `TimeWindowPermission` type (use `TimeWindowPolicy`)
- `ActionWhitelistPermission` type (use `ActionWhitelistPolicy`)
- `VotingPermission` type (use `VotingPolicy`)
- `HumanApprovalPermission` type (use `HumanApprovalPolicy`)
- `PermissionDeniedError` class (use `PolicyDeniedError`)
- `PermissionGate` class (use `PolicyGate`)
- `Verifier.checkPermission()` method (use `checkPolicy()`)
- `InvarianceConfig.permissions` field (use `policies`)

### Removed

- `src/permissions/` directory (moved to `src/policies/`)
- `src/errors/permission-denied.ts` (replaced by `policy-denied.ts`)
- `src/contracts/permission-gate.ts` (replaced by `policy-gate.ts`)

### Fixed

- Wallet adapter type handling with `exactOptionalPropertyTypes`
- Unused variable warnings in contract wrappers
- Test imports updated from `permissions/` to `policies/`
- Verifier tests updated to use `PolicyConfig` with `policies` field

## [0.0.1] - Initial Release

### Added
- Initial package setup
- Core `Invariance` client
- `SpendingCap` policy template
- `TimeWindow` policy template
- `ActionWhitelist` policy template
- `Verifier` for policy checking
- `Serializer` for action serialization
- `LocalWallet` adapter for testing
- `PrivyWallet` adapter for production
- Contract wrappers: `InvarianceCore`, `EscrowVault`, `ExecutionLog`
- Error classes: `InvarianceError`, `StateFailedError`
