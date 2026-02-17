import type {
  AuditConfig,
  AuditLogInput,
  AuditLogMode,
  AuditLogRecord,
  AuditQueryFilters,
  AuditVisibility,
  ActorReference,
} from '@invariance/common';

export type {
  AuditConfig,
  AuditLogInput,
  AuditLogMode,
  AuditLogRecord,
  AuditQueryFilters,
  AuditVisibility,
};

/** Options for a gated action execution. */
export interface GateActionOptions {
  action: string;
  actor: ActorReference;
  category?: string;
  metadata?: Record<string, unknown>;
  mode?: AuditLogMode;
  visibility?: AuditVisibility;
  requestId?: string;
}

/** Result envelope for a gated action. */
export interface GateActionResult<T> {
  result: T;
  mode: AuditLogMode;
  offchain?: {
    attemptId?: string;
    successId?: string;
  };
  onchainEntryId?: string;
}

/** Fully-resolved audit settings. */
export interface ResolvedAuditConfig extends Required<Pick<AuditConfig, 'enabled' | 'mode' | 'visibility' | 'failOpen'>> {
  route: string;
}
