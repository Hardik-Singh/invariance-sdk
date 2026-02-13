/**
 * Batch executor for running multiple operations with concurrency control.
 *
 * @example
 * ```typescript
 * const results = await inv.batch([
 *   { execute: () => inv.identity.register({...}), description: 'Register Bot1' },
 *   { execute: () => inv.identity.register({...}), description: 'Register Bot2' },
 * ], { continueOnError: true, maxConcurrency: 3 });
 * ```
 */
import type { DeferredOperation, BatchOptions, BatchResult } from './convenience-types.js';

/**
 * Execute a batch of operations with concurrency control and error handling.
 */
export class BatchExecutor {
  /**
   * Execute operations with configurable concurrency and error handling.
   *
   * @param operations - Operations to execute
   * @param options - Batch execution options
   * @returns Aggregated results with success/failure counts
   */
  async execute<T = unknown>(
    operations: DeferredOperation<T>[],
    options: BatchOptions = {},
  ): Promise<BatchResult<T>> {
    const { continueOnError = false, maxConcurrency = 5 } = options;
    const results: Array<{ index: number; description: string; result: T }> = [];
    const failures: Array<{ index: number; description: string; error: string }> = [];

    // Process in chunks based on concurrency
    for (let i = 0; i < operations.length; i += maxConcurrency) {
      const chunk = operations.slice(i, i + maxConcurrency);
      const promises = chunk.map(async (op, chunkIdx) => {
        const idx = i + chunkIdx;
        try {
          const result = await op.execute();
          results.push({ index: idx, description: op.description, result });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          failures.push({ index: idx, description: op.description, error });
          if (!continueOnError) {
            throw err;
          }
        }
      });

      try {
        await Promise.all(promises);
      } catch {
        if (!continueOnError) break;
      }
    }

    return {
      results,
      failures,
      successCount: results.length,
      failureCount: failures.length,
      totalCount: operations.length,
    };
  }
}
