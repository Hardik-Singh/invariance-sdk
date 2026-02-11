import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { X402Manager } from '../../src/modules/x402/X402Manager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createMockContractFactory,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';

describe('X402Manager', () => {
  let factory: ContractFactory;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let x402: X402Manager;

  beforeEach(() => {
    factory = createMockContractFactory();
    events = createEventEmitter();
    telemetry = createTelemetry();
    x402 = new X402Manager(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('payForAction()', () => {
    it('throws WALLET_NOT_CONNECTED when wallet client has no account', async () => {
      vi.spyOn(factory, 'getWalletClient').mockReturnValue({
        account: undefined,
        signTypedData: vi.fn(),
      } as unknown as ReturnType<ContractFactory['getWalletClient']>);

      await expect(
        x402.payForAction({
          action: 'swap',
          amount: '1.00',
          recipient: '0xRecipient',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.WALLET_NOT_CONNECTED,
      });
    });

    it('throws WALLET_NOT_CONNECTED when getWalletClient throws', async () => {
      vi.spyOn(factory, 'getWalletClient').mockImplementation(() => {
        throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'Wallet client not initialized');
      });

      await expect(
        x402.payForAction({
          action: 'swap',
          amount: '1.00',
          recipient: '0xRecipient',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.WALLET_NOT_CONNECTED,
      });
    });

    it('emits payment.failed event on error', async () => {
      vi.spyOn(factory, 'getWalletClient').mockImplementation(() => {
        throw new Error('network error');
      });

      const listener = vi.fn();
      events.on('payment.failed', listener);

      await expect(
        x402.payForAction({
          action: 'swap',
          amount: '1.00',
          recipient: '0xRecipient',
        }),
      ).rejects.toThrow(InvarianceError);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0]).toEqual({
        action: 'swap',
        reason: 'network error',
      });
    });

    it('wraps non-InvarianceError failures as PAYMENT_FAILED', async () => {
      vi.spyOn(factory, 'getWalletClient').mockImplementation(() => {
        throw new Error('unexpected');
      });

      await expect(
        x402.payForAction({
          action: 'swap',
          amount: '1.00',
          recipient: '0xRecipient',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.PAYMENT_FAILED,
      });
    });

    it('calls telemetry.track with action and amount', async () => {
      vi.spyOn(factory, 'getWalletClient').mockImplementation(() => {
        throw new InvarianceError(ErrorCode.WALLET_NOT_CONNECTED, 'no wallet');
      });
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(
        x402.payForAction({ action: 'swap', amount: '1.00', recipient: '0xR' }),
      ).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('x402.payForAction', {
        action: 'swap',
        amount: '1.00',
      });
    });
  });

  describe('verifyPayment()', () => {
    it('returns invalid result when receipt is not found', async () => {
      // Mock indexer unavailable
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await x402.verifyPayment('nonexistent-id');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('nonexistent-id');
    });

    it('verifies a cached receipt', async () => {
      // Manually inject a receipt into the manager's cache via payForAction mock path
      // We test the internal cache by directly accessing the receipts map
      const receipt = {
        paymentId: 'test-receipt-1',
        txHash: '0xabc',
        amount: '1.00',
        recipient: '0xRecipient',
        payer: '0xPayer',
        action: 'swap',
        timestamp: Date.now(),
        proof: JSON.stringify({ payload: 'test' }),
      };

      // Access internal cache via casting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x402 as any).receipts.set('test-receipt-1', receipt);

      const result = await x402.verifyPayment('test-receipt-1');

      expect(result.valid).toBe(true);
      expect(result.receipt).toEqual(receipt);
    });

    it('returns invalid for cached receipt with invalid amount', async () => {
      const receipt = {
        paymentId: 'test-receipt-2',
        txHash: '0xabc',
        amount: '-1.00',
        recipient: '0xRecipient',
        payer: '0xPayer',
        action: 'swap',
        timestamp: Date.now(),
        proof: JSON.stringify({ payload: 'test' }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x402 as any).receipts.set('test-receipt-2', receipt);

      const result = await x402.verifyPayment('test-receipt-2');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid payment amount');
    });

    it('returns invalid for cached receipt with non-parseable proof', async () => {
      const receipt = {
        paymentId: 'test-receipt-3',
        txHash: '0xabc',
        amount: '1.00',
        recipient: '0xRecipient',
        payer: '0xPayer',
        action: 'swap',
        timestamp: Date.now(),
        proof: 'not-json',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x402 as any).receipts.set('test-receipt-3', receipt);

      const result = await x402.verifyPayment('test-receipt-3');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Payment verification failed');
    });

    it('tries indexer when receipt not in local cache', async () => {
      const mockReceipt = {
        paymentId: 'indexed-receipt',
        txHash: '0xdef',
        amount: '2.00',
        recipient: '0xR',
        payer: '0xP',
        action: 'transfer',
        timestamp: Date.now(),
        proof: JSON.stringify({ data: 'indexed' }),
      };

      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({ ok: true }) // indexer health check
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockReceipt),
          }),
      );

      const result = await x402.verifyPayment('indexed-receipt');

      expect(result.valid).toBe(true);
      expect(result.receipt).toEqual(mockReceipt);
    });

    it('calls telemetry.track', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
      const trackSpy = vi.spyOn(telemetry, 'track');

      await x402.verifyPayment('some-id');

      expect(trackSpy).toHaveBeenCalledWith('x402.verifyPayment');
    });
  });

  describe('history()', () => {
    it('returns empty array when indexer unavailable and no local cache', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await x402.history('agent-1');

      expect(result).toEqual([]);
    });

    it('returns matching local receipts filtered by action', async () => {
      const receipt1 = {
        paymentId: 'r1',
        txHash: '0x1',
        amount: '1.00',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: '{}',
      };
      const receipt2 = {
        paymentId: 'r2',
        txHash: '0x2',
        amount: '2.00',
        recipient: '0xR',
        payer: '0xP',
        action: 'transfer',
        timestamp: Date.now(),
        proof: '{}',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const receipts = (x402 as any).receipts as Map<string, unknown>;
      receipts.set('r1', receipt1);
      receipts.set('r2', receipt2);

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await x402.history('agent-1', { action: 'swap' });

      expect(result).toHaveLength(1);
      expect(result[0]!.action).toBe('swap');
    });

    it('returns all local receipts when no action filter', async () => {
      const receipt = {
        paymentId: 'r1',
        txHash: '0x1',
        amount: '1.00',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: '{}',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x402 as any).receipts.set('r1', receipt);

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await x402.history('agent-1');

      expect(result).toHaveLength(1);
    });

    it('queries indexer when available', async () => {
      const mockHistory = [
        { paymentId: 'h1', action: 'swap', amount: '1.00' },
        { paymentId: 'h2', action: 'transfer', amount: '2.00' },
      ];

      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({ ok: true }) // health check
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockHistory),
          }),
      );

      const result = await x402.history('agent-1');

      expect(result).toEqual(mockHistory);
    });

    it('calls telemetry.track with hasFilters flag', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
      const trackSpy = vi.spyOn(telemetry, 'track');

      await x402.history('agent-1', { action: 'swap' });

      expect(trackSpy).toHaveBeenCalledWith('x402.history', { hasFilters: true });
    });

    it('tracks hasFilters as false when no filters', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
      const trackSpy = vi.spyOn(telemetry, 'track');

      await x402.history('agent-1');

      expect(trackSpy).toHaveBeenCalledWith('x402.history', { hasFilters: false });
    });
  });

  describe('estimateCost()', () => {
    it('returns default estimate when indexer unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await x402.estimateCost({ action: 'swap' });

      expect(result.amount).toBe('0.01');
      expect(result.action).toBe('swap');
      expect(result.required).toBe(false);
    });

    it('queries indexer when available', async () => {
      const mockEstimate = {
        amount: '0.50',
        action: 'swap',
        required: true,
        breakdown: {
          baseCost: '0.40',
          gasCost: '0.05',
          facilitatorFee: '0.05',
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({ ok: true }) // health check
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockEstimate),
          }),
      );

      const result = await x402.estimateCost({ action: 'swap' });

      expect(result).toEqual(mockEstimate);
    });

    it('calls telemetry.track with action', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
      const trackSpy = vi.spyOn(telemetry, 'track');

      await x402.estimateCost({ action: 'swap' });

      expect(trackSpy).toHaveBeenCalledWith('x402.estimateCost', { action: 'swap' });
    });
  });

  describe('configure()', () => {
    it('calls telemetry.track', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await x402.configure({ facilitatorUrl: 'https://custom.facilitator.com' });

      expect(trackSpy).toHaveBeenCalledWith('x402.configure');
    });

    it('does not throw on valid settings', async () => {
      await expect(
        x402.configure({
          facilitatorUrl: 'https://custom.facilitator.com',
          defaultRecipient: '0xRecipient',
          maxAutoApprove: '10.00',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
