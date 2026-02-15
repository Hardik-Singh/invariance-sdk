/**
 * Re-exports and module-specific types for the Gas module.
 */
export type { GasEstimate, GasBalance } from '@invariance/common';

/** Gas strategy types */
export type GasStrategy = 'standard' | 'fast' | 'abstracted' | 'sponsored';

/** Options for gas estimation */
export interface EstimateGasOptions {
  action: string;
  params?: Record<string, unknown>;
  target?: string;
}
