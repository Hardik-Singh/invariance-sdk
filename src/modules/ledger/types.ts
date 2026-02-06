/**
 * Re-exports and module-specific types for the Event Ledger module.
 */
export type {
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
} from '@invariance/common';

export type { Unsubscribe, ExportData } from '@invariance/common';

/** Callback for streamed ledger entries */
export type LedgerStreamCallback = (entry: import('@invariance/common').LedgerEntry) => void;
