/**
 * Trading agent template.
 */

import type { InvarianceTemplate, DayOfWeek } from '@invariance/common';
import { TemplateBuilder } from '../builder.js';

/**
 * Options for creating a trading agent template.
 */
export interface TradingAgentOptions {
  /** Template name */
  name?: string;
  /** Operator address (who can execute trades) */
  operator: string;
  /** Maximum trade size per transaction */
  maxTradeSize: bigint;
  /** Allowed trading pairs (token addresses) */
  allowedPairs: string[];
  /** Trading hours (UTC) */
  tradingHours?: {
    startHour: number;
    endHour: number;
    allowedDays?: DayOfWeek[];
  };
  /** Cooldown between trades (seconds) */
  cooldown?: number;
  /** Rate limit (trades per hour) */
  rateLimit?: number;
  /** Required stake amount */
  staking?: {
    token: string;
    amount: bigint;
    stakingContract: string;
  };
}

/**
 * Create a trading agent template with full safety rails.
 *
 * @example
 * ```typescript
 * const template = createTradingAgentTemplate({
 *   operator: agentAddress,
 *   maxTradeSize: 10000n * 10n ** 6n, // 10k USDC
 *   allowedPairs: [WETH, USDC, DAI],
 *   tradingHours: { startHour: 8, endHour: 20 },
 *   cooldown: 60, // 1 minute between trades
 *   rateLimit: 100, // 100 trades per hour
 * });
 * ```
 */
export function createTradingAgentTemplate(options: TradingAgentOptions): InvarianceTemplate {
  const builder = TemplateBuilder.create(options.name ?? 'trading-agent')
    .withDescription('DeFi trading agent with comprehensive safety controls')
    .withTags('trading', 'defi', 'agent')
    .requireSignature(options.operator);

  // Add whitelist for allowed trading pairs
  if (options.allowedPairs.length > 0) {
    builder.requireWhitelist(options.allowedPairs);
  }

  // Add trading hours restriction
  if (options.tradingHours) {
    builder.withTimeWindow(
      options.tradingHours.startHour,
      options.tradingHours.endHour,
      options.tradingHours.allowedDays ?? [1, 2, 3, 4, 5], // Weekdays by default
    );
  }

  // Add cooldown
  if (options.cooldown) {
    builder.withCooldown(options.cooldown, 'per-address');
  }

  // Add rate limit
  if (options.rateLimit) {
    builder.limitPerAddress(options.rateLimit, 3600); // Per hour
  }

  // Add value limit based on max trade size
  builder.withRateLimit({
    type: 'value-limit',
    token: '0x0000000000000000000000000000000000000000',
    maxValue: options.maxTradeSize * 1000n, // Daily limit
    windowSeconds: 86400,
    scope: 'per-address',
    maxPerTx: options.maxTradeSize,
  });

  // Add staking requirement
  if (options.staking) {
    builder.requireStake(
      options.staking.token,
      options.staking.amount,
      options.staking.stakingContract,
    );
  }

  builder.immediate();

  return builder.build();
}
