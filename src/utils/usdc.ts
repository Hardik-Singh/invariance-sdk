import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../errors/InvarianceError.js';

/** USDC decimals (6) */
const USDC_DECIMALS = 6;

/**
 * Convert decimal USDC amount to USDC wei (6 decimals).
 *
 * @param amount - Decimal amount string (e.g., "100.50")
 * @returns The amount in USDC wei (6 decimals)
 * @throws {InvarianceError} If amount is not a valid positive decimal string
 */
export function toUSDCWei(amount: string): bigint {
  if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
    throw new InvarianceError(ErrorCode.INVALID_INPUT, `Invalid USDC amount: ${amount}`);
  }
  const parts = amount.split('.');
  const whole = parts[0] ?? '0';
  const fraction = (parts[1] ?? '').padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);
  return BigInt(whole + fraction);
}

/**
 * Convert USDC wei (6 decimals) to decimal string.
 *
 * @param wei - The amount in USDC wei (6 decimals)
 * @returns The amount in decimal format
 */
export function fromUSDCWei(wei: bigint): string {
  const str = wei.toString().padStart(USDC_DECIMALS + 1, '0');
  const whole = str.slice(0, -USDC_DECIMALS);
  const fraction = str.slice(-USDC_DECIMALS);
  return `${whole}.${fraction}`;
}
