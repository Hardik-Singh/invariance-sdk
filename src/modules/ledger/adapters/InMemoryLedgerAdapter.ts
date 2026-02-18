import type { LedgerAdapter, LedgerQueryFilters, OffchainLedgerEntry } from '@invariance/common';

/**
 * In-memory ledger adapter for testing and quick prototyping.
 *
 * Entries are stored in a plain array and lost when the process exits.
 *
 * @example
 * ```typescript
 * import { InMemoryLedgerAdapter } from '@invariance/sdk';
 *
 * const adapter = new InMemoryLedgerAdapter();
 * const inv = new Invariance({ ledgerAdapter: adapter });
 * ```
 */
export class InMemoryLedgerAdapter implements LedgerAdapter {
  /** @internal */
  readonly entries: OffchainLedgerEntry[] = [];

  async insert(entry: OffchainLedgerEntry): Promise<OffchainLedgerEntry> {
    this.entries.push(entry);
    return entry;
  }

  async query(filters: LedgerQueryFilters): Promise<OffchainLedgerEntry[]> {
    let results = [...this.entries];

    if (filters.actor) {
      results = results.filter((e) => e.actor.address === filters.actor);
    }
    if (filters.actorType) {
      results = results.filter((e) => e.actor.type === filters.actorType);
    }
    if (filters.action) {
      if (Array.isArray(filters.action)) {
        results = results.filter((e) => (filters.action as string[]).includes(e.action));
      } else {
        results = results.filter((e) => e.action === filters.action);
      }
    }
    if (filters.category) {
      results = results.filter((e) => e.category === filters.category);
    }
    if (filters.from !== undefined) {
      const fromTs = typeof filters.from === 'string' ? new Date(filters.from).getTime() : filters.from;
      results = results.filter((e) => e.timestamp >= fromTs);
    }
    if (filters.to !== undefined) {
      const toTs = typeof filters.to === 'string' ? new Date(filters.to).getTime() : filters.to;
      results = results.filter((e) => e.timestamp <= toTs);
    }

    const ascending = (filters.order ?? 'desc') === 'asc';
    const orderBy = filters.orderBy ?? 'timestamp';
    results.sort((a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];
      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
      return 0;
    });

    if (filters.offset) {
      results = results.slice(filters.offset);
    }
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }
}
