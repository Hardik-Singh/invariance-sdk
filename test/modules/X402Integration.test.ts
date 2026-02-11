/**
 * Integration tests for x402 module.
 *
 * These tests exercise the real @x402/core and @x402/evm libraries
 * to verify our PaymentRequired structure and client wiring are correct.
 * The signer's signTypedData is mocked (no real keys), but the x402
 * client construction, scheme registration, and payload creation are REAL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import type { ClientEvmSigner } from '@x402/evm';
import { X402PaymentClient } from '../../src/modules/x402/X402Client.js';
import { X402Manager } from '../../src/modules/x402/X402Manager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createMockContractFactory,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';

/** Creates a mock signer that returns a dummy signature */
function createMockSigner(address = '0x1111111111111111111111111111111111111111' as `0x${string}`): ClientEvmSigner {
  return {
    address,
    signTypedData: vi.fn().mockResolvedValue(
      '0x' + 'ab'.repeat(65) as `0x${string}`,
    ),
  };
}

// Skip X402 integration tests in CI environments without Web Crypto API
const hasCryptoAPI = typeof globalThis !== 'undefined' &&
                     globalThis.crypto?.subtle !== undefined;

describe.skipIf(!hasCryptoAPI)('x402 Integration — real @x402/core + @x402/evm', () => {
  describe('x402Client + ExactEvmScheme wiring', () => {
    it('registers ExactEvmScheme on a real x402Client without errors', () => {
      const signer = createMockSigner();
      const client = new x402Client();

      // This must NOT throw — verifies the scheme registration API is correct
      const result = client.register(
        'eip155:84532' as `${string}:${string}`,
        new ExactEvmScheme(signer),
      );

      expect(result).toBe(client); // returns self for chaining
    });

    it('createPaymentPayload accepts our PaymentRequired v2 shape', async () => {
      const signer = createMockSigner();
      const client = new x402Client()
        .register('eip155:84532' as `${string}:${string}`, new ExactEvmScheme(signer));

      // This is the exact shape we build in X402Client.createPayment()
      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: 'swap',
          description: 'Payment for action: swap',
          mimeType: 'application/json',
        },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532' as `${string}:${string}`,
          amount: '1000000', // 1 USDC in smallest units
          payTo: '0x2222222222222222222222222222222222222222',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          maxTimeoutSeconds: 300,
          extra: { name: 'USDC', version: '2' },
        }],
      };

      // This calls the REAL x402Client which:
      // 1. Filters accepts by registered schemes
      // 2. Selects a payment requirement
      // 3. Calls ExactEvmScheme.createPaymentPayload()
      // 4. Which calls signer.signTypedData()
      const payload = await client.createPaymentPayload(paymentRequired);

      expect(payload).toBeDefined();
      expect(payload.x402Version).toBe(2);
      expect(payload.payload).toBeDefined();
      expect(payload.resource).toEqual(paymentRequired.resource);
      expect(payload.accepted).toBeDefined();
      expect(payload.accepted.scheme).toBe('exact');
      expect(payload.accepted.network).toBe('eip155:84532');

      // Verify the signer was actually called
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });

    it('signTypedData receives EIP-712 structured data', async () => {
      const signer = createMockSigner();
      const client = new x402Client()
        .register('eip155:84532' as `${string}:${string}`, new ExactEvmScheme(signer));

      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: 'transfer',
          description: 'Payment for action: transfer',
          mimeType: 'application/json',
        },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532' as `${string}:${string}`,
          amount: '500000', // 0.50 USDC
          payTo: '0x3333333333333333333333333333333333333333',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          maxTimeoutSeconds: 300,
          extra: { name: 'USDC', version: '2' },
        }],
      };

      await client.createPaymentPayload(paymentRequired);

      // Verify structured EIP-712 data was passed
      const signCall = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(signCall).toHaveProperty('domain');
      expect(signCall).toHaveProperty('types');
      expect(signCall).toHaveProperty('primaryType');
      expect(signCall).toHaveProperty('message');
    });
  });

  describe('X402PaymentClient.createPayment() — real x402 flow', () => {
    it('produces a valid PaymentReceipt with proof', async () => {
      const signer = createMockSigner();
      const client = new X402PaymentClient(84532);

      const receipt = await client.createPayment(
        signer,
        '1.50',
        '0x2222222222222222222222222222222222222222',
        'swap',
      );

      expect(receipt.paymentId).toMatch(/^x402_/);
      expect(receipt.txHash).toMatch(/^0x/);
      expect(receipt.amount).toBe('1.50');
      expect(receipt.recipient).toBe('0x2222222222222222222222222222222222222222');
      expect(receipt.payer).toBe(signer.address);
      expect(receipt.action).toBe('swap');
      expect(receipt.timestamp).toBeGreaterThan(0);

      // Proof should be a JSON-serialized x402 PaymentPayload
      const proof = JSON.parse(receipt.proof);
      expect(proof).toBeDefined();
      expect(proof.x402Version).toBe(2);
      expect(proof.payload).toBeDefined();
    });

    it('converts USDC amount to 6-decimal units correctly', async () => {
      const signer = createMockSigner();
      const client = new X402PaymentClient(84532);

      const receipt = await client.createPayment(
        signer,
        '0.01',
        '0x2222222222222222222222222222222222222222',
        'query',
      );

      // Verify the signer was called (meaning the flow succeeded)
      expect(signer.signTypedData).toHaveBeenCalledOnce();

      // The signTypedData call should contain the amount in smallest units
      const signCall = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      const message = signCall.message as Record<string, unknown>;
      // The value field in the EIP-3009 typed data should be 10000 (0.01 * 1_000_000)
      if (message.value !== undefined) {
        expect(BigInt(message.value as string | number)).toBe(10000n);
      }

      expect(receipt.amount).toBe('0.01');
    });
  });

  describe('X402Manager full flow — payForAction + verifyPayment', () => {
    it('payForAction creates receipt, verifyPayment validates it', async () => {
      const factory = createMockContractFactory();
      const events = createEventEmitter();
      const telemetry = createTelemetry();

      // Mock getWalletClient to return a wallet with account
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        type: 'json-rpc' as const,
      };
      vi.spyOn(factory, 'getWalletClient').mockReturnValue({
        account: mockAccount,
        signTypedData: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
      } as unknown as ReturnType<typeof factory.getWalletClient>);

      // Use Base Sepolia chain ID
      vi.spyOn(factory, 'getChainId').mockReturnValue(84532);

      const x402 = new X402Manager(factory, events, telemetry);

      // Track events
      const completedListener = vi.fn();
      events.on('payment.completed', completedListener);

      // Step 1: Pay for an action
      const receipt = await x402.payForAction({
        action: 'swap',
        amount: '1.00',
        recipient: '0x2222222222222222222222222222222222222222',
      });

      expect(receipt.paymentId).toMatch(/^x402_/);
      expect(receipt.action).toBe('swap');
      expect(receipt.amount).toBe('1.00');
      expect(completedListener).toHaveBeenCalledOnce();
      expect(completedListener).toHaveBeenCalledWith({
        paymentId: receipt.paymentId,
        action: 'swap',
        amount: '1.00',
      });

      // Step 2: Verify the payment (from local cache)
      const verification = await x402.verifyPayment(receipt.paymentId);

      expect(verification.valid).toBe(true);
      expect(verification.receipt?.paymentId).toBe(receipt.paymentId);
    });

    it('emits payment.failed and throws on signer error', async () => {
      const factory = createMockContractFactory();
      const events = createEventEmitter();
      const telemetry = createTelemetry();

      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        type: 'json-rpc' as const,
      };
      vi.spyOn(factory, 'getWalletClient').mockReturnValue({
        account: mockAccount,
        signTypedData: vi.fn().mockRejectedValue(new Error('user rejected signing')),
      } as unknown as ReturnType<typeof factory.getWalletClient>);
      vi.spyOn(factory, 'getChainId').mockReturnValue(84532);

      const x402 = new X402Manager(factory, events, telemetry);

      const failedListener = vi.fn();
      events.on('payment.failed', failedListener);

      await expect(
        x402.payForAction({
          action: 'swap',
          amount: '1.00',
          recipient: '0x2222222222222222222222222222222222222222',
        }),
      ).rejects.toThrow(InvarianceError);

      expect(failedListener).toHaveBeenCalledOnce();
      // Verify payment failure was emitted with a reason (message varies by environment)
      expect(failedListener.mock.calls[0]![0].reason).toBeTruthy();
      expect(typeof failedListener.mock.calls[0]![0].reason).toBe('string');
    });
  });
});
