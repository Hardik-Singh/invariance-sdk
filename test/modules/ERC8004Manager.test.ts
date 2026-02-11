import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ERC8004Manager, ERC8004Error } from '../../src/modules/erc8004/ERC8004Manager.js';
import { ERC8004_REGISTRY_ADDRESSES, getERC8004Addresses, isERC8004Supported } from '../../src/modules/erc8004/addresses.js';
import type { ERC8004Config } from '../../src/modules/erc8004/types.js';

// Mock viem's getContract
vi.mock('viem', () => ({
  getContract: vi.fn().mockReturnValue({
    address: '0x1234' as `0x${string}`,
    abi: [],
    read: {},
    write: {},
  }),
}));

function createMockPublicClient() {
  return {
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      transactionHash: '0xabc123' as `0x${string}`,
      blockNumber: 100n,
      status: 'success' as const,
      logs: [
        {
          topics: [
            '0xevent_sig',
            '0x0000000000000000000000000000000000000000000000000000000000000001',
          ],
          data: '0x',
        },
      ],
    }),
  };
}

function createMockWalletClient() {
  return {
    account: { address: '0xWallet' as `0x${string}` },
    signTypedData: vi.fn(),
  };
}

function createReadOnlyConfig(overrides?: Partial<ERC8004Config>): ERC8004Config {
  return {
    chainId: 84532,
    publicClient: createMockPublicClient(),
    ...overrides,
  };
}

function createReadWriteConfig(overrides?: Partial<ERC8004Config>): ERC8004Config {
  return {
    chainId: 84532,
    publicClient: createMockPublicClient(),
    walletClient: createMockWalletClient(),
    ...overrides,
  };
}

describe('ERC8004Manager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Config & Constructor
  // ===========================================================================

  describe('constructor', () => {
    it('creates instance for known chain', () => {
      const manager = new ERC8004Manager(createReadOnlyConfig());
      expect(manager).toBeInstanceOf(ERC8004Manager);
    });

    it('throws ERC8004_NOT_DEPLOYED for unknown chain', () => {
      expect(
        () => new ERC8004Manager(createReadOnlyConfig({ chainId: 999999 })),
      ).toThrow(ERC8004Error);

      try {
        new ERC8004Manager(createReadOnlyConfig({ chainId: 999999 }));
      } catch (err) {
        expect((err as ERC8004Error).code).toBe('ERC8004_NOT_DEPLOYED');
      }
    });

    it('accepts custom registry addresses for unknown chain', () => {
      const manager = new ERC8004Manager(
        createReadOnlyConfig({
          chainId: 999999,
          registryAddresses: {
            identity: '0x1111111111111111111111111111111111111111' as `0x${string}`,
            reputation: '0x2222222222222222222222222222222222222222' as `0x${string}`,
            validation: '0x3333333333333333333333333333333333333333' as `0x${string}`,
          },
        }),
      );
      expect(manager).toBeInstanceOf(ERC8004Manager);
    });
  });

  // ===========================================================================
  // Identity Methods
  // ===========================================================================

  describe('Identity', () => {
    let manager: ERC8004Manager;

    beforeEach(() => {
      manager = new ERC8004Manager(createReadWriteConfig());
    });

    describe('register()', () => {
      it('requires walletClient for write operations', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());

        await expect(
          readOnlyManager.register('https://agent.example.com'),
        ).rejects.toThrow(ERC8004Error);
      });
    });

    describe('getAgent()', () => {
      it('throws ERC8004_AGENT_NOT_FOUND when agent URI is empty', async () => {
        // Mock the identity contract read to return empty string
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            agentURI: vi.fn().mockResolvedValue(''),
            getAgentWallet: vi.fn().mockResolvedValue('0x0000' as `0x${string}`),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());

        await expect(mgr.getAgent(999n)).rejects.toThrow(ERC8004Error);
        try {
          await mgr.getAgent(999n);
        } catch (err) {
          expect((err as ERC8004Error).code).toBe('ERC8004_AGENT_NOT_FOUND');
        }
      });

      it('returns agent identity when found', async () => {
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            agentURI: vi.fn().mockResolvedValue('https://agent.example.com'),
            getAgentWallet: vi.fn().mockResolvedValue('0xWalletAddr' as `0x${string}`),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());
        const agent = await mgr.getAgent(1n);

        expect(agent.agentId).toBe(1n);
        expect(agent.agentURI).toBe('https://agent.example.com');
        expect(agent.wallet).toBe('0xWalletAddr');
        expect(agent.globalId).toContain('eip155:84532:');
      });
    });

    describe('getGlobalId()', () => {
      it('computes correct format: eip155:{chainId}:{registryAddress}:{agentId}', () => {
        const globalId = manager.getGlobalId(42n);
        expect(globalId).toMatch(/^eip155:84532:0x[0-9a-fA-F]+:42$/);
      });
    });

    describe('setMetadata()', () => {
      it('requires walletClient', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());
        await expect(
          readOnlyManager.setMetadata(1n, 'key', 'value'),
        ).rejects.toThrow(ERC8004Error);
      });
    });

    describe('getMetadata()', () => {
      it('reads metadata from contract', async () => {
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            getMetadata: vi.fn().mockResolvedValue('test-value'),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());
        const value = await mgr.getMetadata(1n, 'test-key');

        expect(value).toBe('test-value');
      });
    });

    describe('setAgentWallet()', () => {
      it('requires walletClient', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());
        await expect(
          readOnlyManager.setAgentWallet(
            1n,
            '0xNewWallet' as `0x${string}`,
            BigInt(Math.floor(Date.now() / 1000) + 3600),
            '0xSignature' as `0x${string}`,
          ),
        ).rejects.toThrow(ERC8004Error);
      });
    });

    describe('setAgentURI()', () => {
      it('requires walletClient', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());
        await expect(
          readOnlyManager.setAgentURI(1n, 'https://new-uri.example.com'),
        ).rejects.toThrow(ERC8004Error);
      });
    });
  });

  // ===========================================================================
  // Reputation Methods
  // ===========================================================================

  describe('Reputation', () => {
    describe('giveFeedback()', () => {
      it('requires walletClient', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());
        await expect(
          readOnlyManager.giveFeedback({
            agentId: 1n,
            value: 4,
            tag1: 'quality',
          }),
        ).rejects.toThrow(ERC8004Error);
      });
    });

    describe('revokeFeedback()', () => {
      it('requires walletClient', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());
        await expect(
          readOnlyManager.revokeFeedback(1n, 0n),
        ).rejects.toThrow(ERC8004Error);
      });
    });

    describe('getSummary()', () => {
      it('reads and parses summary from contract', async () => {
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            getSummary: vi.fn().mockResolvedValue([10n, 350n, 2]),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());
        const summary = await mgr.getSummary(1n);

        expect(summary.count).toBe(10);
        expect(summary.summaryValue).toBe(350);
        expect(summary.decimals).toBe(2);
      });

      it('works with filter options (reserved)', async () => {
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            getSummary: vi.fn().mockResolvedValue([5n, 200n, 1]),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());
        const summary = await mgr.getSummary(1n, { tag: 'quality' });

        expect(summary.count).toBe(5);
      });
    });

    describe('readAllFeedback()', () => {
      it('reads and maps all feedback entries', async () => {
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            readAllFeedback: vi.fn().mockResolvedValue([
              {
                client: '0xClient1' as `0x${string}`,
                value: 4,
                tag1: 'quality',
                tag2: '',
                feedbackURI: 'https://feedback.example.com',
                timestamp: 1700000000n,
              },
              {
                client: '0xClient2' as `0x${string}`,
                value: 5,
                tag1: 'speed',
                tag2: 'reliable',
                feedbackURI: '',
                timestamp: 1700001000n,
              },
            ]),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());
        const feedback = await mgr.readAllFeedback(1n);

        expect(feedback).toHaveLength(2);
        expect(feedback[0]!.client).toBe('0xClient1');
        expect(feedback[0]!.value).toBe(4);
        expect(feedback[0]!.tag1).toBe('quality');
        expect(feedback[0]!.timestamp).toBe(1700000000);
        expect(feedback[1]!.value).toBe(5);
        expect(feedback[1]!.tag1).toBe('speed');
      });
    });
  });

  // ===========================================================================
  // Validation Methods
  // ===========================================================================

  describe('Validation', () => {
    describe('requestValidation()', () => {
      it('requires walletClient', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());
        await expect(
          readOnlyManager.requestValidation({
            agentId: 1n,
            validator: '0xValidator' as `0x${string}`,
            requestURI: 'https://validate.example.com',
          }),
        ).rejects.toThrow(ERC8004Error);
      });
    });

    describe('respondToValidation()', () => {
      it('requires walletClient', async () => {
        const readOnlyManager = new ERC8004Manager(createReadOnlyConfig());
        await expect(
          readOnlyManager.respondToValidation({
            requestHash: '0xRequestHash' as `0x${string}`,
            response: 1,
          }),
        ).rejects.toThrow(ERC8004Error);
      });
    });

    describe('getValidationStatus()', () => {
      it('reads and parses validation status from contract', async () => {
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            getValidationStatus: vi.fn().mockResolvedValue([
              1n,
              '0xValidator' as `0x${string}`,
              'https://validate.example.com',
              1,
              'https://response.example.com',
              true,
            ]),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());
        const status = await mgr.getValidationStatus('0xHash' as `0x${string}`);

        expect(status.agentId).toBe(1n);
        expect(status.validator).toBe('0xValidator');
        expect(status.requestURI).toBe('https://validate.example.com');
        expect(status.response).toBe(1);
        expect(status.responseURI).toBe('https://response.example.com');
        expect(status.completed).toBe(true);
      });
    });

    describe('getValidationSummary()', () => {
      it('reads and parses validation summary from contract', async () => {
        const { getContract } = await import('viem');
        (getContract as ReturnType<typeof vi.fn>).mockReturnValue({
          address: '0x1234' as `0x${string}`,
          abi: [],
          read: {
            getSummary: vi.fn().mockResolvedValue([5n, 4n]),
          },
          write: {},
        });

        const mgr = new ERC8004Manager(createReadOnlyConfig());
        const summary = await mgr.getValidationSummary(1n);

        expect(summary.count).toBe(5);
        expect(summary.avgResponse).toBe(4);
      });
    });
  });
});

// ===========================================================================
// Address helpers
// ===========================================================================

describe('addresses', () => {
  describe('getERC8004Addresses()', () => {
    it('returns addresses for known chains', () => {
      expect(getERC8004Addresses(1)).toBeDefined();
      expect(getERC8004Addresses(8453)).toBeDefined();
      expect(getERC8004Addresses(84532)).toBeDefined();
    });

    it('returns undefined for unknown chains', () => {
      expect(getERC8004Addresses(999999)).toBeUndefined();
    });
  });

  describe('isERC8004Supported()', () => {
    it('returns true for supported chains', () => {
      expect(isERC8004Supported(1)).toBe(true);
      expect(isERC8004Supported(8453)).toBe(true);
      expect(isERC8004Supported(84532)).toBe(true);
    });

    it('returns false for unsupported chains', () => {
      expect(isERC8004Supported(999999)).toBe(false);
    });
  });
});
