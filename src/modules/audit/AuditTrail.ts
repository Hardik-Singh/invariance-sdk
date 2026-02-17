import type { InvarianceConfig, AuditLogInput, AuditLogRecord, AuditQueryFilters } from '@invariance/common';
import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import type { EventLedger } from '../ledger/EventLedger.js';
import type { GateActionOptions, GateActionResult, ResolvedAuditConfig } from './types.js';

/** Default API route used for off-chain audit ingest/query. */
const DEFAULT_AUDIT_ROUTE = '/audit/logs';

export class AuditTrail {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private readonly ledger: EventLedger;
  private readonly config: ResolvedAuditConfig;
  private indexer: IndexerClient | null = null;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
    ledger: EventLedger,
    config?: InvarianceConfig['audit'],
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
    this.ledger = ledger;
    this.config = {
      enabled: config?.enabled ?? true,
      mode: config?.mode ?? 'offchain',
      visibility: config?.visibility ?? 'private',
      route: config?.route ?? DEFAULT_AUDIT_ROUTE,
      failOpen: config?.failOpen ?? true,
    };
  }

  /** Resolved audit configuration currently used by this module. */
  getSettings(): ResolvedAuditConfig {
    return { ...this.config };
  }

  /** Log a single off-chain audit record. */
  async log(input: AuditLogInput): Promise<AuditLogRecord> {
    this.telemetry.track('audit.log', {
      action: input.action,
      status: input.status,
      mode: 'offchain',
    });

    const record = await this.getIndexer().post<AuditLogRecord>(this.config.route, {
      ...input,
      visibility: input.visibility ?? this.config.visibility,
      timestamp: input.timestamp ?? Date.now(),
    });
    return record;
  }

  /** Query off-chain audit logs. */
  async query(filters: AuditQueryFilters): Promise<{ data: AuditLogRecord[]; total: number }> {
    this.telemetry.track('audit.query', { hasFilters: Object.keys(filters).length > 0 });
    return this.getIndexer().getPaginated<AuditLogRecord>(this.config.route, {
      actor: filters.actor,
      action: Array.isArray(filters.action) ? filters.action.join(',') : filters.action,
      status: filters.status,
      category: filters.category,
      visibility: filters.visibility,
      from: typeof filters.from === 'string' ? filters.from : filters.from?.toString(),
      to: typeof filters.to === 'string' ? filters.to : filters.to?.toString(),
      page: filters.page,
      pageSize: filters.pageSize,
    });
  }

  /**
   * Execute any action through a consistent SDK gate:
   * - emits action lifecycle events
   * - writes off-chain audit logs (default)
   * - optionally anchors to on-chain ledger
   */
  async gate<T>(opts: GateActionOptions, executor: () => Promise<T>): Promise<GateActionResult<T>> {
    const mode = opts.mode ?? this.config.mode;
    const startedAt = Date.now();
    const requestId = opts.requestId ?? `audit_${startedAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    this.events.emit('action.before', {
      action: opts.action,
      actor: opts.actor,
      timestamp: startedAt,
    });

    let offchainAttemptId: string | undefined;
    if (this.config.enabled && (mode === 'offchain' || mode === 'dual')) {
      const attemptPayload: AuditLogInput = {
        action: opts.action,
        actor: opts.actor,
        status: 'attempt',
        visibility: opts.visibility ?? this.config.visibility,
        requestId,
        timestamp: startedAt,
      };
      if (opts.category !== undefined) attemptPayload.category = opts.category;
      if (opts.metadata !== undefined) attemptPayload.metadata = opts.metadata;
      offchainAttemptId = await this.tryOffchainLog(attemptPayload);
    }

    try {
      const result = await executor();
      const durationMs = Date.now() - startedAt;

      let onchainEntryId: string | undefined;
      if (this.config.enabled && (mode === 'onchain' || mode === 'dual')) {
        const entry = await this.ledger.log({
          action: opts.action,
          actor: opts.actor,
          category: (opts.category as 'execution' | 'payment' | 'policy' | 'attestation' | 'custom' | undefined) ?? 'execution',
          severity: 'info',
          metadata: {
            ...(opts.metadata ?? {}),
            requestId,
            status: 'success',
            durationMs,
          },
        });
        onchainEntryId = entry.entryId;
      }

      const offchainSuccessId = this.config.enabled && (mode === 'offchain' || mode === 'dual')
        ? await this.tryOffchainLog((() => {
          const successPayload: AuditLogInput = {
            action: opts.action,
            actor: opts.actor,
            status: 'success',
            visibility: opts.visibility ?? this.config.visibility,
            requestId,
            durationMs,
            timestamp: Date.now(),
          };
          if (opts.category !== undefined) successPayload.category = opts.category;
          if (opts.metadata !== undefined) successPayload.metadata = opts.metadata;
          return successPayload;
        })())
        : undefined;

      this.events.emit('action.after', {
        action: opts.action,
        actor: opts.actor,
        durationMs,
        success: true,
        timestamp: Date.now(),
      });

      const output: GateActionResult<T> = {
        result,
        mode,
        onchainEntryId,
      };
      if (offchainAttemptId !== undefined || offchainSuccessId !== undefined) {
        output.offchain = {};
        if (offchainAttemptId !== undefined) output.offchain.attemptId = offchainAttemptId;
        if (offchainSuccessId !== undefined) output.offchain.successId = offchainSuccessId;
      }
      return output;
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);

      this.events.emit('action.error', {
        action: opts.action,
        message,
        timestamp: Date.now(),
      });
      this.events.emit('action.after', {
        action: opts.action,
        actor: opts.actor,
        durationMs,
        success: false,
        timestamp: Date.now(),
      });

      if (this.config.enabled && (mode === 'offchain' || mode === 'dual')) {
        const failurePayload: AuditLogInput = {
          action: opts.action,
          actor: opts.actor,
          status: 'failure',
          visibility: opts.visibility ?? this.config.visibility,
          requestId,
          durationMs,
          error: { message },
          timestamp: Date.now(),
        };
        if (opts.category !== undefined) failurePayload.category = opts.category;
        if (opts.metadata !== undefined) failurePayload.metadata = opts.metadata;
        await this.tryOffchainLog(failurePayload);
      }

      if (this.config.enabled && (mode === 'onchain' || mode === 'dual')) {
        try {
          await this.ledger.log({
            action: opts.action,
            actor: opts.actor,
            category: (opts.category as 'execution' | 'payment' | 'policy' | 'attestation' | 'custom' | undefined) ?? 'execution',
            severity: 'error',
            metadata: {
              ...(opts.metadata ?? {}),
              requestId,
              status: 'failure',
              durationMs,
              error: message,
            },
          });
        } catch (onchainErr) {
          if (!this.config.failOpen) {
            throw new InvarianceError(
              ErrorCode.NETWORK_ERROR,
              `On-chain audit logging failed: ${onchainErr instanceof Error ? onchainErr.message : String(onchainErr)}`,
            );
          }
        }
      }

      throw err;
    }
  }

  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl(), this.contracts.getApiKey());
    }
    return this.indexer;
  }

  private async tryOffchainLog(input: AuditLogInput): Promise<string | undefined> {
    try {
      const row = await this.log(input);
      return row.id;
    } catch (err) {
      if (!this.config.failOpen) {
        throw new InvarianceError(
          ErrorCode.NETWORK_ERROR,
          `Off-chain audit logging failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return undefined;
    }
  }
}
