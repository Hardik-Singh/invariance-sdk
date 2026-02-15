import { describe, it, expect } from 'vitest';
import { serializeRule, deserializeRule } from '../../src/modules/policy/rule-serializer.js';

const ZERO_HEX = '0x' as const;

describe('policy rule serializer', () => {
  it('round-trips require-payment via custom encoding', () => {
    const rule = {
      type: 'require-payment',
      config: { minAmount: '1.00', exemptActions: ['read'] },
    } as const;

    const encoded = serializeRule(rule);
    expect(encoded.ruleType).toBe(14);
    expect(encoded.config).not.toBe(ZERO_HEX);

    const decoded = deserializeRule(encoded);
    expect(decoded.type).toBe('require-payment');
    expect(decoded.config).toEqual(rule.config);
  });

  it('encodes time-window in hour precision', () => {
    const rule = {
      type: 'time-window',
      config: { start: '09:00', end: '17:00' },
    } as const;

    const encoded = serializeRule(rule);
    const decoded = deserializeRule(encoded);

    expect(decoded.type).toBe('time-window');
    expect(decoded.config).toEqual({ start: '9', end: '17' });
  });
});
