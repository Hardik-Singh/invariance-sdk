import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GasManager } from '../../src/modules/gas/GasManager.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';

describe('GasManager', () => {
  let factory: ContractFactory;
  let mockContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let telemetry: Telemetry;
  let gas: GasManager;

  beforeEach(() => {
    mockContract = createMockContract({
      read: {
        balanceOf: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockContract, publicClient: mockPublicClient });

    vi.spyOn(factory, 'getGasStrategy').mockReturnValue('standard');
    vi.spyOn(factory, 'getWalletAddress').mockReturnValue('0x1111111111111111111111111111111111111111');

    telemetry = createTelemetry();
    gas = new GasManager(factory, createEventEmitter(), telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('estimate()', () => {
    it('returns non-zero values for known actions', async () => {
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n); // 1 gwei

      const result = await gas.estimate({ action: 'swap' });

      expect(parseFloat(result.ethCost)).toBeGreaterThan(0);
      expect(parseFloat(result.usdcCost)).toBeGreaterThan(0);
      expect(result.gasLimit).toBe(200_000); // swap gas limit
      expect(result.gasPrice).toBe('1000000000');
      expect(result.strategy).toBe('standard');
    });

    it('uses default gas limit for unknown actions', async () => {
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n);

      const result = await gas.estimate({ action: 'unknown-custom-action' });

      expect(result.gasLimit).toBe(200_000); // default
    });

    it('uses specific gas limits for known actions', async () => {
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n);

      const register = await gas.estimate({ action: 'register' });
      expect(register.gasLimit).toBe(200_000);

      const policy = await gas.estimate({ action: 'policy' });
      expect(policy.gasLimit).toBe(250_000);

      const log = await gas.estimate({ action: 'log' });
      expect(log.gasLimit).toBe(150_000);

      const transfer = await gas.estimate({ action: 'transfer' });
      expect(transfer.gasLimit).toBe(100_000);
    });

    it('calculates USDC cost based on ETH baseline', async () => {
      // 10 gwei gas price
      mockPublicClient.getGasPrice.mockResolvedValue(10000000000n);

      const result = await gas.estimate({ action: 'register' });

      // 200_000 gas * 10 gwei = 0.002 ETH
      // 0.002 ETH * 3000 USD/ETH = 6.00 USDC
      expect(parseFloat(result.ethCost)).toBeCloseTo(0.002, 4);
      expect(parseFloat(result.usdcCost)).toBeCloseTo(6.0, 1);
    });

    it('returns current gas strategy', async () => {
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n);
      vi.spyOn(factory, 'getGasStrategy').mockReturnValue('fast');

      const result = await gas.estimate({ action: 'swap' });

      expect(result.strategy).toBe('fast');
    });
  });

  describe('balance()', () => {
    it('returns ETH and USDC balances', async () => {
      mockPublicClient.getBalance.mockResolvedValue(2000000000000000000n); // 2 ETH
      mockContract.read.balanceOf.mockResolvedValue(500000000n); // 500 USDC

      const result = await gas.balance();

      expect(result.ethBalance).toBe('2');
      expect(result.usdcBalance).toBe('500.000000');
    });

    it('canAbstract is true when strategy is abstracted and USDC > 0', async () => {
      vi.spyOn(factory, 'getGasStrategy').mockReturnValue('abstracted');
      mockPublicClient.getBalance.mockResolvedValue(0n);
      mockContract.read.balanceOf.mockResolvedValue(1000000n); // 1 USDC

      const result = await gas.balance();

      expect(result.canAbstract).toBe(true);
    });

    it('canAbstract is false when strategy is standard', async () => {
      vi.spyOn(factory, 'getGasStrategy').mockReturnValue('standard');
      mockPublicClient.getBalance.mockResolvedValue(1000000000000000000n);
      mockContract.read.balanceOf.mockResolvedValue(1000000n);

      const result = await gas.balance();

      expect(result.canAbstract).toBe(false);
    });

    it('canAbstract is false when USDC balance is zero', async () => {
      vi.spyOn(factory, 'getGasStrategy').mockReturnValue('abstracted');
      mockPublicClient.getBalance.mockResolvedValue(1000000000000000000n);
      mockContract.read.balanceOf.mockResolvedValue(0n);

      const result = await gas.balance();

      expect(result.canAbstract).toBe(false);
    });

    it('handles USDC contract error gracefully', async () => {
      mockPublicClient.getBalance.mockResolvedValue(1000000000000000000n);
      mockContract.read.balanceOf.mockRejectedValue(new Error('contract error'));

      const result = await gas.balance();

      expect(result.ethBalance).toBe('1');
      expect(result.usdcBalance).toBe('0.00');
    });
  });

  describe('telemetry', () => {
    it('tracks estimate calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n);

      await gas.estimate({ action: 'swap' });

      expect(trackSpy).toHaveBeenCalledWith('gas.estimate', { action: 'swap' });
    });

    it('tracks balance calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      mockPublicClient.getBalance.mockResolvedValue(0n);
      mockContract.read.balanceOf.mockResolvedValue(0n);

      await gas.balance();

      expect(trackSpy).toHaveBeenCalledWith('gas.balance');
    });
  });
});
