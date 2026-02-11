import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { X402PaymentClient } from '../../src/modules/x402/X402Client.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';

describe('X402PaymentClient', () => {
  let client: X402PaymentClient;

  beforeEach(() => {
    client = new X402PaymentClient(84532); // Base Sepolia
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUsdcAddress()', () => {
    it('returns Base Sepolia USDC address for chain 84532', () => {
      const addr = client.getUsdcAddress();
      expect(addr).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    });

    it('returns Base mainnet USDC address for chain 8453', () => {
      const mainnetClient = new X402PaymentClient(8453);
      const addr = mainnetClient.getUsdcAddress();
      expect(addr).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });

    it('throws NETWORK_ERROR for unsupported chain', () => {
      const unsupported = new X402PaymentClient(1); // Ethereum mainnet
      expect(() => unsupported.getUsdcAddress()).toThrow(InvarianceError);
      expect(() => unsupported.getUsdcAddress()).toThrow(/Unsupported chain/);
    });

    it('uses custom USDC address from settings', () => {
      client.configure({
        usdcAddress: '0xCustomUSDC',
      });

      const addr = client.getUsdcAddress();
      expect(addr).toBe('0xCustomUSDC');
    });
  });

  describe('getFacilitatorUrl()', () => {
    it('returns default facilitator URL', () => {
      const url = client.getFacilitatorUrl();
      expect(url).toBe('https://x402.org/facilitator');
    });

    it('returns custom facilitator URL from settings', () => {
      client.configure({
        facilitatorUrl: 'https://my-facilitator.com',
      });

      const url = client.getFacilitatorUrl();
      expect(url).toBe('https://my-facilitator.com');
    });
  });

  describe('configure()', () => {
    it('merges new settings with existing ones', () => {
      client.configure({ facilitatorUrl: 'https://first.com' });
      client.configure({ usdcAddress: '0xNew' });

      expect(client.getFacilitatorUrl()).toBe('https://first.com');
      expect(client.getUsdcAddress()).toBe('0xNew');
    });

    it('overrides existing settings', () => {
      client.configure({ facilitatorUrl: 'https://first.com' });
      client.configure({ facilitatorUrl: 'https://second.com' });

      expect(client.getFacilitatorUrl()).toBe('https://second.com');
    });
  });

  describe('verifyPayment()', () => {
    it('returns valid for receipt with parseable proof and positive amount', async () => {
      const result = await client.verifyPayment({
        paymentId: 'p1',
        txHash: '0xabc',
        amount: '1.50',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: JSON.stringify({ payload: { data: 'test' } }),
      });

      expect(result.valid).toBe(true);
      expect(result.receipt?.paymentId).toBe('p1');
    });

    it('returns invalid for empty proof payload', async () => {
      const result = await client.verifyPayment({
        paymentId: 'p2',
        txHash: '0xabc',
        amount: '1.00',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: JSON.stringify(null),
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty payload');
    });

    it('returns invalid for unparseable proof', async () => {
      const result = await client.verifyPayment({
        paymentId: 'p3',
        txHash: '0xabc',
        amount: '1.00',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: 'not-valid-json',
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Payment verification failed');
    });

    it('returns invalid for zero amount', async () => {
      const result = await client.verifyPayment({
        paymentId: 'p4',
        txHash: '0xabc',
        amount: '0',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: JSON.stringify({ data: 'test' }),
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid payment amount');
    });

    it('returns invalid for negative amount', async () => {
      const result = await client.verifyPayment({
        paymentId: 'p5',
        txHash: '0xabc',
        amount: '-5.00',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: JSON.stringify({ data: 'test' }),
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid payment amount');
    });

    it('returns invalid for NaN amount', async () => {
      const result = await client.verifyPayment({
        paymentId: 'p6',
        txHash: '0xabc',
        amount: 'not-a-number',
        recipient: '0xR',
        payer: '0xP',
        action: 'swap',
        timestamp: Date.now(),
        proof: JSON.stringify({ data: 'test' }),
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid payment amount');
    });
  });

  describe('createPayment()', () => {
    it('throws PAYMENT_FAILED when x402 client fails', async () => {
      const mockSigner = {
        address: '0xSignerAddress' as `0x${string}`,
        signTypedData: vi.fn().mockRejectedValue(new Error('signing failed')),
      };

      await expect(
        client.createPayment(mockSigner, '1.00', '0xRecipient', 'swap'),
      ).rejects.toThrow(InvarianceError);

      try {
        await client.createPayment(mockSigner, '1.00', '0xRecipient', 'swap');
      } catch (err) {
        expect(err).toBeInstanceOf(InvarianceError);
        expect((err as InvarianceError).code).toBe(ErrorCode.PAYMENT_FAILED);
      }
    });

    it('throws NETWORK_ERROR for unsupported chain in createPayment', async () => {
      const unsupported = new X402PaymentClient(1); // Ethereum mainnet
      const mockSigner = {
        address: '0xSignerAddress' as `0x${string}`,
        signTypedData: vi.fn(),
      };

      await expect(
        unsupported.createPayment(mockSigner, '1.00', '0xRecipient', 'swap'),
      ).rejects.toThrow(InvarianceError);
    });
  });
});
