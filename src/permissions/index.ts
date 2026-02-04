/**
 * Permission templates for Invariance SDK.
 *
 * @packageDocumentation
 */

// Permission template classes
export { SpendingCap } from './spending-cap.js';
export type { SpendingCapOptions } from './spending-cap.js';

export { TimeWindow } from './time-window.js';
export type { TimeWindowOptions } from './time-window.js';

export { ActionWhitelist } from './action-whitelist.js';
export type { ActionWhitelistOptions } from './action-whitelist.js';

export { Voting } from './voting.js';
export type { VotingOptions, Vote, Proposal, VoteRequestCallback } from './voting.js';

export { HumanApproval } from './human-approval.js';
export type {
  HumanApprovalOptions,
  ApprovalRequest,
  ApprovalRequestCallback,
  CustomPredicate,
} from './human-approval.js';

// Base types
export type { PermissionTemplate, AsyncPermissionTemplate } from './types.js';
export { isAsyncPermission } from './types.js';
