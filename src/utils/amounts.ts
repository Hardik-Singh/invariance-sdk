import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../errors/InvarianceError.js';

/**
 * Parse a base-unit amount (integer string) into bigint.
 *
 * Accepts:
 * - bigint
 * - number (must be a non-negative integer)
 * - string of digits (non-negative integer, no decimals)
 */
export function parseBaseUnitAmount(
  value: string | number | bigint,
  fieldName = 'amount',
): bigint {
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `Invalid ${fieldName}: ${value}. Must be a non-negative integer in base units.`,
      );
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    if (!/^[0-9]+$/.test(value)) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `Invalid ${fieldName}: ${value}. Must be a non-negative integer string in base units (no decimals).`,
      );
    }
    return BigInt(value);
  }

  throw new InvarianceError(
    ErrorCode.INVALID_INPUT,
    `Invalid ${fieldName}: unsupported type. Must be a bigint, number, or numeric string.`,
  );
}
