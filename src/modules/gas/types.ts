/**
 * Re-exports and module-specific types for the Gas module.
 */
export type { GasEstimate, GasBalance } from '@invariance/common';

/** Options for gas estimation */
export interface EstimateGasOptions {
  action: string;
  params?: Record<string, unknown>;
  target?: string;
}
