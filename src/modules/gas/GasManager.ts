import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { formatEther } from 'viem';
import type { GasEstimate, GasBalance, EstimateGasOptions } from './types.js';

/** Gas limits by action type (conservative estimates) */
const GAS_LIMITS: Record<string, number> = {
  'register': 200_000,
  'update': 150_000,
  'policy': 250_000,
  'create-policy': 250_000,
  'attach-policy': 150_000,
  'intent': 200_000,
  'request': 200_000,
  'approve': 100_000,
  'reject': 80_000,
  'escrow': 250_000,
  'create-escrow': 250_000,
  'fund': 150_000,
  'release': 120_000,
  'refund': 120_000,
  'dispute': 150_000,
  'ledger': 150_000,
  'log': 150_000,
  'review': 180_000,
  'swap': 200_000,
  'transfer': 100_000,
};

/** Default gas limit for unknown actions */
const DEFAULT_GAS_LIMIT = 200_000;

/** Approximate ETH/USD rate for USDC conversion baseline */
const ETH_USD_BASELINE = 3000;

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

    const publicClient = this.contracts.getPublicClient();
    const strategy = this.contracts.getGasStrategy();

    // Get current gas price from RPC
    const gasPrice = await publicClient.getGasPrice();

    // Look up gas limit for the action
    const gasLimit = GAS_LIMITS[opts.action] ?? DEFAULT_GAS_LIMIT;

    // Calculate ETH cost: gasLimit * gasPrice (in wei)
    const ethCostWei = BigInt(gasLimit) * gasPrice;
    const ethCost = formatEther(ethCostWei);

    // Convert to USDC at baseline rate
    const ethCostNum = parseFloat(ethCost);
    const usdcCost = (ethCostNum * ETH_USD_BASELINE).toFixed(6);

    return {
      ethCost,
      usdcCost,
      gasLimit,
      gasPrice: gasPrice.toString(),
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

    const publicClient = this.contracts.getPublicClient();
    const strategy = this.contracts.getGasStrategy();
    const walletAddress = this.contracts.getWalletAddress() as `0x${string}`;

    // Get ETH balance
    const ethBalanceWei = await publicClient.getBalance({ address: walletAddress });
    const ethBalance = formatEther(ethBalanceWei);

    // Get USDC balance
    let usdcBalance = '0.00';
    try {
      const usdcContract = this.contracts.getContract('mockUsdc');
      const balanceOfFn = usdcContract.read['balanceOf'];
      if (balanceOfFn) {
        const rawBalance = await balanceOfFn([walletAddress]) as bigint;
        // USDC has 6 decimals
        usdcBalance = (Number(rawBalance) / 1_000_000).toFixed(6);
      }
    } catch {
      // USDC contract may not be available
    }

    // Can abstract gas if strategy is abstracted AND USDC balance is sufficient
    const hasUsdc = parseFloat(usdcBalance) > 0;
    const canAbstract = strategy === 'abstracted' && hasUsdc;

    return {
      ethBalance,
      usdcBalance,
      canAbstract,
    };
  }
}
