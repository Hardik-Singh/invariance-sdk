import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import type { GasEstimate, GasBalance, EstimateGasOptions } from './types.js';

/**
 * Gas abstraction for Invariance operations.
 *
 * Provides gas estimation and balance checking with support for
 * USDC-based gas abstraction (where users pay gas fees in USDC
 * instead of ETH).
 *
 * @example
 * ```typescript
 * const estimate = await inv.gas.estimate({ action: 'swap' });
 * console.log(estimate.usdcCost);
 *
 * const balance = await inv.gas.balance();
 * console.log(balance.canAbstract);
 * ```
 */
export class GasManager {
  private readonly contracts: ContractFactory;
  private readonly telemetry: Telemetry;

  constructor(
    contracts: ContractFactory,
    _events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.telemetry = telemetry;
  }

  /**
   * Estimate gas cost for an action.
   *
   * Returns both ETH and USDC costs based on the current gas strategy.
   *
   * @param opts - Action details for gas estimation
   * @returns Gas estimate with ETH and USDC costs
   */
  async estimate(opts: EstimateGasOptions): Promise<GasEstimate> {
    this.telemetry.track('gas.estimate', { action: opts.action });

    // TODO: Estimate gas via eth_estimateGas or simulation
    // 1. Build transaction data for the action
    // 2. Call eth_estimateGas
    // 3. Fetch current gas price
    // 4. Convert to USDC using price feed
    const strategy = this.contracts.getGasStrategy();

    return {
      ethCost: '0.00',
      usdcCost: '0.00',
      gasLimit: 100_000,
      gasPrice: '0',
      strategy,
    };
  }

  /**
   * Get gas-related balances for the current wallet.
   *
   * Returns ETH and USDC balances and whether gas abstraction
   * is available (requires sufficient USDC and abstracted strategy).
   *
   * @returns Gas balance information
   */
  async balance(): Promise<GasBalance> {
    this.telemetry.track('gas.balance');

    // TODO: Query RPC for ETH + USDC balances
    // Check if gas abstraction is possible
    const strategy = this.contracts.getGasStrategy();

    return {
      ethBalance: '0.00',
      usdcBalance: '0.00',
      canAbstract: strategy === 'abstracted',
    };
  }
}
