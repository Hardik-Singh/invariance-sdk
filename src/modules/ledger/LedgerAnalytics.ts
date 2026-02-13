/**
 * Semantic analytics helpers for common ledger query patterns.
 *
 * @example
 * ```typescript
 * const rate = await inv.ledger.analytics.successRate('0xBot', { from: '2025-01-01' });
 * const costs = await inv.ledger.analytics.costSummary('0xBot', { from: '2025-01-01' });
 * ```
 */
import type { EventLedger } from './EventLedger.js';
import type { LedgerQueryFilters } from './types.js';
import type {
  AnalyticsTimeframe,
  SuccessRateResult,
  ActionCountResult,
  CostSummaryResult,
  ViolationResult,
} from './types.js';

/** Build query filters, only including defined timeframe fields */
function buildFilters(
  base: LedgerQueryFilters,
  timeframe?: AnalyticsTimeframe,
): LedgerQueryFilters {
  const filters: LedgerQueryFilters = { ...base, limit: 10000 };
  if (timeframe?.from !== undefined) filters.from = timeframe.from;
  if (timeframe?.to !== undefined) filters.to = timeframe.to;
  return filters;
}

/**
 * Analytics layer on top of the Event Ledger.
 */
export class LedgerAnalytics {
  constructor(private readonly ledger: EventLedger) {}

  /**
   * Calculate the success rate for an actor's actions.
   *
   * @param actor - Actor address
   * @param timeframe - Optional time range filter
   * @returns Success rate as a ratio and percentage
   */
  async successRate(actor: string, timeframe?: AnalyticsTimeframe): Promise<SuccessRateResult> {
    const entries = await this.ledger.query(buildFilters({ actor }, timeframe));

    const total = entries.length;
    const successful = entries.filter((e) => {
      const status = (e.metadata as Record<string, unknown> | undefined)?.['status'];
      return status !== 'failed' && status !== 'rejected' && status !== 'violation';
    }).length;

    return {
      total,
      successful,
      failed: total - successful,
      rate: total > 0 ? successful / total : 0,
      percentage: total > 0 ? Math.round((successful / total) * 10000) / 100 : 0,
    };
  }

  /**
   * Count occurrences of a specific action for an actor.
   *
   * @param actor - Actor address
   * @param action - Action name to count
   * @param timeframe - Optional time range filter
   * @returns Count and breakdown by category
   */
  async actionCount(actor: string, action: string, timeframe?: AnalyticsTimeframe): Promise<ActionCountResult> {
    const entries = await this.ledger.query(buildFilters({ actor, action }, timeframe));

    const byCategory: Record<string, number> = {};
    for (const entry of entries) {
      const cat = entry.category ?? 'custom';
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }

    return {
      action,
      count: entries.length,
      byCategory,
    };
  }

  /**
   * Summarize costs/spending for an actor.
   *
   * @param actor - Actor address
   * @param timeframe - Optional time range filter
   * @returns Cost breakdown by action
   */
  async costSummary(actor: string, timeframe?: AnalyticsTimeframe): Promise<CostSummaryResult> {
    const entries = await this.ledger.query(buildFilters({ actor }, timeframe));

    let totalCost = 0;
    const byAction: Record<string, number> = {};

    for (const entry of entries) {
      const meta = entry.metadata as Record<string, unknown> | undefined;
      const cost = Number(meta?.['cost'] ?? meta?.['amount'] ?? meta?.['gasUsed'] ?? 0);
      totalCost += cost;
      byAction[entry.action] = (byAction[entry.action] ?? 0) + cost;
    }

    return {
      totalCost: totalCost.toString(),
      transactionCount: entries.length,
      byAction,
    };
  }

  /**
   * Query policy violations for an actor.
   *
   * @param actor - Actor address
   * @param timeframe - Optional time range filter
   * @returns List of violations with details
   */
  async violations(actor: string, timeframe?: AnalyticsTimeframe): Promise<ViolationResult> {
    const entries = await this.ledger.query(buildFilters({ actor, category: 'violation' }, timeframe));

    const byAction: Record<string, number> = {};
    const details = entries.map((entry) => {
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
      const meta = entry.metadata as Record<string, unknown> | undefined;
      return {
        action: entry.action,
        timestamp: entry.timestamp,
        detail: (meta?.['detail'] as string | undefined) ?? '',
        policyId: (meta?.['policyId'] as string | undefined) ?? '',
      };
    });

    return {
      total: entries.length,
      byAction,
      details,
    };
  }
}
