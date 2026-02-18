import type { LedgerAdapter, LedgerQueryFilters, OffchainLedgerEntry, ActorType } from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../../errors/InvarianceError.js';

const TABLE_NAME = 'offchain_ledger_entries';

/**
 * Supabase client type — dynamically imported to keep the dependency optional.
 * @internal
 */
interface SupabaseClient {
  from(table: string): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert(row: Record<string, unknown>): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select(columns?: string): any;
  };
}

/**
 * Off-chain ledger adapter backed by Supabase.
 *
 * @example
 * ```typescript
 * import { SupabaseLedgerAdapter } from '@invariance/sdk';
 *
 * const adapter = new SupabaseLedgerAdapter({
 *   url: 'https://my-project.supabase.co',
 *   key: 'my-anon-key',
 * });
 * ```
 */
export class SupabaseLedgerAdapter implements LedgerAdapter {
  private readonly url: string;
  private readonly key: string;
  private client: SupabaseClient | null = null;
  private clientPromise: Promise<SupabaseClient> | null = null;

  constructor(options: { url: string; key: string }) {
    this.url = options.url;
    this.key = options.key;
  }

  /** @internal */
  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;
    if (this.clientPromise) return this.clientPromise;

    this.clientPromise = (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        this.client = createClient(this.url, this.key) as unknown as SupabaseClient;
        return this.client;
      } catch {
        throw new InvarianceError(
          ErrorCode.NETWORK_ERROR,
          'Failed to import @supabase/supabase-js. Install it with: npm install @supabase/supabase-js',
        );
      }
    })();

    return this.clientPromise;
  }

  /** Persist a ledger entry to Supabase. */
  async insert(entry: OffchainLedgerEntry): Promise<OffchainLedgerEntry> {
    const row = {
      entry_id: entry.entryId,
      action: entry.action,
      actor_type: entry.actor.type,
      actor_address: entry.actor.address,
      category: entry.category,
      severity: entry.severity,
      metadata: entry.metadata ?? null,
      timestamp: entry.timestamp,
    };

    const client = await this.getClient();
    const { data, error } = await client
      .from(TABLE_NAME)
      .insert(row)
      .select()
      .single();

    if (error) {
      throw new InvarianceError(ErrorCode.NETWORK_ERROR, `Supabase insert failed: ${error.message}`);
    }

    return SupabaseLedgerAdapter.toEntry(data!);
  }

  /** Query ledger entries from Supabase. */
  async query(filters: LedgerQueryFilters): Promise<OffchainLedgerEntry[]> {
    const client = await this.getClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = client.from(TABLE_NAME).select('*');

    if (filters.actor) {
      q = q.eq('actor_address', filters.actor);
    }
    if (filters.actorType) {
      q = q.eq('actor_type', filters.actorType);
    }
    if (filters.action) {
      if (Array.isArray(filters.action)) {
        q = q.in('action', filters.action);
      } else {
        q = q.eq('action', filters.action);
      }
    }
    if (filters.category) {
      q = q.eq('category', filters.category);
    }
    if (filters.from !== undefined) {
      const fromTs = typeof filters.from === 'string' ? new Date(filters.from).getTime() : filters.from;
      q = q.gte('timestamp', fromTs);
    }
    if (filters.to !== undefined) {
      const toTs = typeof filters.to === 'string' ? new Date(filters.to).getTime() : filters.to;
      q = q.lte('timestamp', toTs);
    }

    const orderCol = filters.orderBy ?? 'timestamp';
    const ascending = (filters.order ?? 'desc') === 'asc';
    q = q.order(orderCol, { ascending });

    if (filters.limit) {
      q = q.limit(filters.limit);
    }
    if (filters.offset) {
      q = q.range(filters.offset, filters.offset + (filters.limit ?? 100) - 1);
    }

    const { data, error } = await q;

    if (error) {
      throw new InvarianceError(ErrorCode.NETWORK_ERROR, `Supabase query failed: ${error.message}`);
    }

    return (data as Record<string, unknown>[]).map((row: Record<string, unknown>) =>
      SupabaseLedgerAdapter.toEntry(row),
    );
  }

  /** Map a Supabase row to an OffchainLedgerEntry. */
  private static toEntry(row: Record<string, unknown>): OffchainLedgerEntry {
    const entry: OffchainLedgerEntry = {
      entryId: row['entry_id'] as string,
      action: row['action'] as string,
      actor: {
        type: row['actor_type'] as ActorType,
        address: row['actor_address'] as string,
      },
      category: row['category'] as string,
      severity: row['severity'] as OffchainLedgerEntry['severity'],
      timestamp: row['timestamp'] as number,
      createdAt: row['created_at'] as string,
    };
    if (row['metadata'] != null) {
      entry.metadata = row['metadata'] as Record<string, unknown>;
    }
    return entry;
  }
}
