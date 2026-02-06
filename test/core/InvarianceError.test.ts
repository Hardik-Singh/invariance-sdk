import { describe, it, expect } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../src/errors/InvarianceError.js';

describe('InvarianceError', () => {
  it('stores code and message', () => {
    const err = new InvarianceError(ErrorCode.NETWORK_ERROR, 'boom');
    expect(err.code).toBe(ErrorCode.NETWORK_ERROR);
    expect(err.message).toBe('boom');
  });

  it('has name set to InvarianceError', () => {
    const err = new InvarianceError(ErrorCode.NETWORK_ERROR, 'test');
    expect(err.name).toBe('InvarianceError');
  });

  it('is instanceof Error', () => {
    const err = new InvarianceError(ErrorCode.NETWORK_ERROR, 'test');
    expect(err).toBeInstanceOf(Error);
  });

  it('is instanceof InvarianceError', () => {
    const err = new InvarianceError(ErrorCode.NETWORK_ERROR, 'test');
    expect(err).toBeInstanceOf(InvarianceError);
  });

  it('stores optional explorerUrl', () => {
    const err = new InvarianceError(ErrorCode.TX_REVERTED, 'reverted', {
      explorerUrl: 'https://basescan.org/tx/0xabc',
    });
    expect(err.explorerUrl).toBe('https://basescan.org/tx/0xabc');
  });

  it('stores optional txHash', () => {
    const err = new InvarianceError(ErrorCode.TX_REVERTED, 'reverted', {
      txHash: '0xdeadbeef',
    });
    expect(err.txHash).toBe('0xdeadbeef');
  });

  it('stores both explorerUrl and txHash', () => {
    const err = new InvarianceError(ErrorCode.TX_REVERTED, 'reverted', {
      explorerUrl: 'https://basescan.org/tx/0xabc',
      txHash: '0xabc',
    });
    expect(err.explorerUrl).toBe('https://basescan.org/tx/0xabc');
    expect(err.txHash).toBe('0xabc');
  });

  it('defaults explorerUrl and txHash to undefined when opts not provided', () => {
    const err = new InvarianceError(ErrorCode.NETWORK_ERROR, 'test');
    expect(err.explorerUrl).toBeUndefined();
    expect(err.txHash).toBeUndefined();
  });

  it('captures a stack trace', () => {
    const err = new InvarianceError(ErrorCode.NETWORK_ERROR, 'test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('InvarianceError');
  });

  it('works with every ErrorCode value', () => {
    for (const code of Object.values(ErrorCode)) {
      const err = new InvarianceError(code, `error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.message).toBe(`error: ${code}`);
    }
  });
});
