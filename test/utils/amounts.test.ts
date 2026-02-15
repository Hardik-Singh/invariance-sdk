import { describe, it, expect } from 'vitest';
import { parseBaseUnitAmount } from '../../src/utils/amounts.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import { ErrorCode } from '@invariance/common';

describe('parseBaseUnitAmount', () => {
  it('parses integer strings', () => {
    expect(parseBaseUnitAmount('0')).toBe(0n);
    expect(parseBaseUnitAmount('42')).toBe(42n);
  });

  it('parses bigint and integer numbers', () => {
    expect(parseBaseUnitAmount(10n)).toBe(10n);
    expect(parseBaseUnitAmount(7)).toBe(7n);
  });

  it('rejects decimals and negatives', () => {
    const cases = ['1.5', '-1', '1e3', ''];
    for (const value of cases) {
      expect(() => parseBaseUnitAmount(value)).toThrow(InvarianceError);
      try {
        parseBaseUnitAmount(value);
      } catch (err) {
        expect((err as InvarianceError).code).toBe(ErrorCode.INVALID_INPUT);
      }
    }
  });

  it('rejects non-integer numbers', () => {
    expect(() => parseBaseUnitAmount(1.1)).toThrow(InvarianceError);
  });
});
