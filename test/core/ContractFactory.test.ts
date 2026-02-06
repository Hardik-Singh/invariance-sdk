import { describe, it, expect } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { ContractFactory } from '../../src/core/ContractFactory.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  BASE_SEPOLIA_CONFIG,
  BASE_CONFIG,
  createContractFactory,
} from '../fixtures/mocks.js';

describe('ContractFactory', () => {
  describe('constructor', () => {
    it('base: sets chainId to 8453', () => {
      const factory = new ContractFactory(BASE_CONFIG);
      expect(factory.getChainId()).toBe(8453);
    });

    it('base-sepolia: sets chainId to 84532', () => {
      const factory = new ContractFactory(BASE_SEPOLIA_CONFIG);
      expect(factory.getChainId()).toBe(84532);
    });

    it('base: chain config name is Base', () => {
      const factory = new ContractFactory(BASE_CONFIG);
      expect(factory.getChainConfig().name).toBe('Base');
    });

    it('base-sepolia: chain config name is Base Sepolia', () => {
      const factory = new ContractFactory(BASE_SEPOLIA_CONFIG);
      expect(factory.getChainConfig().name).toBe('Base Sepolia');
    });
  });

  describe('getRpcUrl()', () => {
    it('returns chain default when no override', () => {
      const factory = createContractFactory();
      expect(factory.getRpcUrl()).toBe('https://sepolia.base.org');
    });

    it('returns config override when provided', () => {
      const factory = createContractFactory({
        rpcUrl: 'https://custom.rpc.url',
      });
      expect(factory.getRpcUrl()).toBe('https://custom.rpc.url');
    });
  });

  describe('getAddress()', () => {
    it('returns string for identity', () => {
      const factory = createContractFactory();
      expect(typeof factory.getAddress('identity')).toBe('string');
    });

    it('returns string for policy', () => {
      const factory = createContractFactory();
      expect(typeof factory.getAddress('policy')).toBe('string');
    });

    it('returns string for all contract keys', () => {
      const factory = createContractFactory();
      const addresses = factory.getAddresses();
      for (const key of Object.keys(addresses)) {
        expect(typeof factory.getAddress(key as keyof typeof addresses)).toBe(
          'string',
        );
      }
    });
  });

  describe('getSigner()', () => {
    it('returns undefined when no signer configured', () => {
      const factory = createContractFactory();
      expect(factory.getSigner()).toBeUndefined();
    });

    it('returns signer value when configured', () => {
      const signer = { fake: true };
      const factory = createContractFactory({ signer });
      expect(factory.getSigner()).toBe(signer);
    });
  });

  describe('getApiKey()', () => {
    it('returns undefined when no API key configured', () => {
      const factory = createContractFactory();
      expect(factory.getApiKey()).toBeUndefined();
    });

    it('returns API key when configured', () => {
      const factory = createContractFactory({ apiKey: 'inv_test_123' });
      expect(factory.getApiKey()).toBe('inv_test_123');
    });
  });

  describe('getGasStrategy()', () => {
    it('defaults to standard', () => {
      const factory = createContractFactory();
      expect(factory.getGasStrategy()).toBe('standard');
    });

    it('returns configured strategy', () => {
      const factory = createContractFactory({ gasStrategy: 'fast' });
      expect(factory.getGasStrategy()).toBe('fast');
    });
  });

  describe('getExplorerBaseUrl()', () => {
    it('returns default URL when no override', () => {
      const factory = createContractFactory();
      expect(factory.getExplorerBaseUrl()).toBe(
        'https://verify.useinvariance.com',
      );
    });

    it('returns override when configured', () => {
      const factory = createContractFactory({
        explorerBaseUrl: 'https://custom.explorer.com',
      });
      expect(factory.getExplorerBaseUrl()).toBe('https://custom.explorer.com');
    });
  });

  describe('isManaged()', () => {
    it('returns false when no API key', () => {
      const factory = createContractFactory();
      expect(factory.isManaged()).toBe(false);
    });

    it('returns true when API key is present', () => {
      const factory = createContractFactory({ apiKey: 'inv_test_123' });
      expect(factory.isManaged()).toBe(true);
    });
  });

  describe('client management', () => {
    it('hasClients() returns false initially', () => {
      const factory = createContractFactory();
      expect(factory.hasClients()).toBe(false);
    });

    it('getPublicClient() throws WALLET_NOT_CONNECTED before clients set', () => {
      const factory = createContractFactory();
      expect(() => factory.getPublicClient()).toThrow(InvarianceError);
      try {
        factory.getPublicClient();
      } catch (err) {
        expect((err as InvarianceError).code).toBe(
          ErrorCode.WALLET_NOT_CONNECTED,
        );
      }
    });

    it('getWalletClient() throws WALLET_NOT_CONNECTED before clients set', () => {
      const factory = createContractFactory();
      expect(() => factory.getWalletClient()).toThrow(InvarianceError);
      try {
        factory.getWalletClient();
      } catch (err) {
        expect((err as InvarianceError).code).toBe(
          ErrorCode.WALLET_NOT_CONNECTED,
        );
      }
    });

    it('getContract() throws before clients set', () => {
      const factory = createContractFactory();
      expect(() => factory.getContract('identity')).toThrow(InvarianceError);
    });

    it('hasClients() returns true after setClients()', () => {
      const factory = createContractFactory();
      // Minimal mock clients
      const publicClient = {} as Parameters<
        typeof factory.setClients
      >[0];
      const walletClient = {} as Parameters<
        typeof factory.setClients
      >[1];
      factory.setClients(publicClient, walletClient);
      expect(factory.hasClients()).toBe(true);
    });
  });

  describe('getApiBaseUrl()', () => {
    it('returns production URL for base', () => {
      const factory = new ContractFactory(BASE_CONFIG);
      expect(factory.getApiBaseUrl()).toBe('https://api.useinvariance.com');
    });

    it('returns sepolia URL for base-sepolia', () => {
      const factory = createContractFactory();
      expect(factory.getApiBaseUrl()).toBe(
        'https://api-sepolia.useinvariance.com',
      );
    });
  });

  describe('getChainConfig()', () => {
    it('returns chain config with expected fields', () => {
      const factory = createContractFactory();
      const config = factory.getChainConfig();
      expect(config).toHaveProperty('id');
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('rpcUrl');
      expect(config).toHaveProperty('explorerUrl');
      expect(config).toHaveProperty('testnet');
    });

    it('base-sepolia is testnet', () => {
      const factory = createContractFactory();
      expect(factory.getChainConfig().testnet).toBe(true);
    });

    it('base is not testnet', () => {
      const factory = new ContractFactory(BASE_CONFIG);
      expect(factory.getChainConfig().testnet).toBe(false);
    });
  });
});
