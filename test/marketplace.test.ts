import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceClient } from '../src/marketplace/client.js';
import { CustomPermissionDeployer } from '../src/marketplace/deployer.js';
import { PermissionRegistry } from '../src/contracts/permission-registry.js';
import { InvarianceError } from '../src/errors/base.js';
import type { WalletAdapter } from '../src/wallet/types.js';
import type {
  CustomPermissionMetadata,
  CustomPermissionId,
  AgentPermissionConfig,
  CustomPermissionCheckResult,
} from '@invariance/common';
import { createCustomPermissionId } from '@invariance/common';

// ============================================================================
// Mock Types and Helpers
// ============================================================================

const mockAddresses = {
  core: '0x1111111111111111111111111111111111111111',
  permissionGate: '0x2222222222222222222222222222222222222222',
  executionLog: '0x3333333333333333333333333333333333333333',
  escrowVault: '0x4444444444444444444444444444444444444444',
  permissionRegistry: '0x5555555555555555555555555555555555555555',
};

const mockRpcUrl = 'https://mainnet.base.org';

function createMockWallet(): WalletAdapter {
  return {
    getAddress: vi.fn().mockResolvedValue('0xAgent1111111111111111111111111111111111'),
    signMessage: vi.fn().mockResolvedValue('0xsignature'),
    sendTransaction: vi.fn().mockResolvedValue('0xtxhash'),
  } as unknown as WalletAdapter;
}

function createMockPermissionMetadata(id: number): CustomPermissionMetadata {
  return {
    permissionId: createCustomPermissionId(id),
    contractAddress: `0x${id.toString().padStart(40, '0')}`,
    name: `Permission ${id}`,
    description: `Test permission ${id}`,
    version: '1.0.0',
    author: '0xAuthor111111111111111111111111111111111',
    tags: ['test', 'mock'],
    codeHash: '0xabcdef',
    registrationTime: Date.now(),
    usageCount: id * 10,
    verified: id % 2 === 0,
    active: true,
  };
}

// ============================================================================
// MarketplaceClient Tests
// ============================================================================

describe('MarketplaceClient', () => {
  describe('initialization', () => {
    it('should create client without wallet for read-only operations', () => {
      const client = new MarketplaceClient({
        addresses: mockAddresses,
        rpcUrl: mockRpcUrl,
      });

      expect(client).toBeDefined();
      expect(client.wallet).toBeUndefined();
    });

    it('should create client with wallet for write operations', () => {
      const wallet = createMockWallet();
      const client = new MarketplaceClient({
        addresses: mockAddresses,
        rpcUrl: mockRpcUrl,
        wallet,
      });

      expect(client).toBeDefined();
      expect(client.wallet).toBe(wallet);
    });

    it('should create registry instance with correct addresses', () => {
      const client = new MarketplaceClient({
        addresses: mockAddresses,
        rpcUrl: mockRpcUrl,
      });

      expect(client.registry).toBeInstanceOf(PermissionRegistry);
      expect(client.registry.getAddress()).toBe(mockAddresses.permissionRegistry);
    });
  });

  describe('query methods', () => {
    let client: MarketplaceClient;

    beforeEach(() => {
      client = new MarketplaceClient({
        addresses: mockAddresses,
        rpcUrl: mockRpcUrl,
      });
    });

    describe('listPermissions', () => {
      it('should call registry with default options', async () => {
        const mockPermissions = [
          createMockPermissionMetadata(1),
          createMockPermissionMetadata(2),
        ];

        // Mock the registry methods
        vi.spyOn(client.registry, 'getPermissionCount').mockResolvedValue(2);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            return mockPermissions[numId - 1];
          });

        const result = await client.listPermissions();

        expect(client.registry.getPermissionCount).toHaveBeenCalled();
        expect(result.length).toBe(2);
      });

      it('should filter by verifiedOnly', async () => {
        const mockPermissions = [
          createMockPermissionMetadata(1), // verified = false
          createMockPermissionMetadata(2), // verified = true
          createMockPermissionMetadata(3), // verified = false
        ];

        vi.spyOn(client.registry, 'getPermissionCount').mockResolvedValue(3);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            return mockPermissions[numId - 1];
          });

        const result = await client.listPermissions({ verifiedOnly: true });

        expect(result.length).toBe(1);
        expect(result[0].verified).toBe(true);
      });

      it('should filter by author', async () => {
        const mockPermissions = [
          { ...createMockPermissionMetadata(1), author: '0xAlice' },
          { ...createMockPermissionMetadata(2), author: '0xBob' },
        ];

        vi.spyOn(client.registry, 'getPermissionCount').mockResolvedValue(2);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            return mockPermissions[numId - 1];
          });

        const result = await client.listPermissions({ author: '0xAlice' });

        expect(result.length).toBe(1);
        expect(result[0].author).toBe('0xAlice');
      });

      it('should filter by tag', async () => {
        const mockPermissions = [
          { ...createMockPermissionMetadata(1), tags: ['spending', 'limit'] },
          { ...createMockPermissionMetadata(2), tags: ['time', 'window'] },
        ];

        vi.spyOn(client.registry, 'getPermissionCount').mockResolvedValue(2);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            return mockPermissions[numId - 1];
          });

        const result = await client.listPermissions({ tag: 'spending' });

        expect(result.length).toBe(1);
        expect(result[0].tags).toContain('spending');
      });

      it('should sort by usageCount', async () => {
        const mockPermissions = [
          { ...createMockPermissionMetadata(1), usageCount: 10 },
          { ...createMockPermissionMetadata(2), usageCount: 50 },
          { ...createMockPermissionMetadata(3), usageCount: 25 },
        ];

        vi.spyOn(client.registry, 'getPermissionCount').mockResolvedValue(3);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            return mockPermissions[numId - 1];
          });

        const result = await client.listPermissions({
          sortBy: 'usageCount',
          sortOrder: 'desc',
        });

        expect(result[0].usageCount).toBe(50);
        expect(result[1].usageCount).toBe(25);
        expect(result[2].usageCount).toBe(10);
      });

      it('should apply pagination', async () => {
        const mockPermissions = [
          createMockPermissionMetadata(1),
          createMockPermissionMetadata(2),
          createMockPermissionMetadata(3),
          createMockPermissionMetadata(4),
          createMockPermissionMetadata(5),
        ];

        vi.spyOn(client.registry, 'getPermissionCount').mockResolvedValue(5);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            return mockPermissions[numId - 1];
          });

        const result = await client.listPermissions({
          limit: 2,
          offset: 1,
        });

        expect(result.length).toBe(2);
      });
    });

    describe('getPermission', () => {
      it('should return permission metadata', async () => {
        const mockMetadata = createMockPermissionMetadata(1);

        vi.spyOn(client.registry, 'getPermissionMetadata').mockResolvedValue(mockMetadata);

        const result = await client.getPermission(createCustomPermissionId(1));

        expect(result).toEqual(mockMetadata);
        expect(client.registry.getPermissionMetadata).toHaveBeenCalledWith(
          createCustomPermissionId(1)
        );
      });
    });

    describe('getFeaturedPermissions', () => {
      it('should return verified permissions sorted by usage', async () => {
        const mockPermissions = [
          { ...createMockPermissionMetadata(2), usageCount: 100, verified: true },
          { ...createMockPermissionMetadata(4), usageCount: 50, verified: true },
        ];

        vi.spyOn(client.registry, 'getPermissionCount').mockResolvedValue(4);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            if (numId % 2 === 0) {
              return mockPermissions[(numId / 2) - 1];
            }
            // Unverified permissions
            return { ...createMockPermissionMetadata(numId), verified: false };
          });

        const result = await client.getFeaturedPermissions(10);

        expect(result.length).toBe(2);
        expect(result.every((p) => p.verified)).toBe(true);
        expect(result[0].usageCount).toBeGreaterThanOrEqual(result[1].usageCount);
      });
    });

    describe('getPermissionsByAuthor', () => {
      it('should return all permissions by author', async () => {
        const authorIds = [createCustomPermissionId(1), createCustomPermissionId(3)];

        vi.spyOn(client.registry, 'getPermissionsByAuthor').mockResolvedValue(authorIds);
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            return createMockPermissionMetadata(parseInt(String(id), 10));
          });

        const result = await client.getPermissionsByAuthor('0xAuthor');

        expect(result.length).toBe(2);
        expect(client.registry.getPermissionsByAuthor).toHaveBeenCalledWith('0xAuthor');
      });
    });

    describe('getEnabledPermissions', () => {
      it('should return only active enabled permissions', async () => {
        const enabledIds = [
          createCustomPermissionId(1),
          createCustomPermissionId(2),
          createCustomPermissionId(3),
        ];

        vi.spyOn(client.registry, 'getAgentPermissions').mockResolvedValue(enabledIds);
        vi.spyOn(client.registry, 'getAgentPermissionConfig')
          .mockImplementation(async (_agent: string, id: CustomPermissionId) => {
            const numId = parseInt(String(id), 10);
            return {
              gasBudget: 100000n,
              enabledAt: Date.now(),
              active: numId !== 2, // Permission 2 is disabled
            };
          });
        vi.spyOn(client.registry, 'getPermissionMetadata')
          .mockImplementation(async (id: CustomPermissionId) => {
            return createMockPermissionMetadata(parseInt(String(id), 10));
          });

        const result = await client.getEnabledPermissions('0xAgent');

        expect(result.length).toBe(2);
      });
    });

    describe('getAgentPermissionConfig', () => {
      it('should return agent config for permission', async () => {
        const mockConfig: AgentPermissionConfig = {
          gasBudget: 150000n,
          enabledAt: Date.now(),
          active: true,
        };

        vi.spyOn(client.registry, 'getAgentPermissionConfig').mockResolvedValue(mockConfig);

        const result = await client.getAgentPermissionConfig(
          '0xAgent',
          createCustomPermissionId(1)
        );

        expect(result).toEqual(mockConfig);
      });
    });
  });

  describe('action methods', () => {
    let client: MarketplaceClient;
    let wallet: WalletAdapter;

    beforeEach(() => {
      wallet = createMockWallet();
      client = new MarketplaceClient({
        addresses: mockAddresses,
        rpcUrl: mockRpcUrl,
        wallet,
      });
    });

    describe('enablePermission', () => {
      it('should enable permission with gas budget', async () => {
        const mockMetadata = { ...createMockPermissionMetadata(1), active: true };
        const mockResult = { txHash: '0xabc', blockNumber: 12345 };

        vi.spyOn(client.registry, 'getPermissionMetadata').mockResolvedValue(mockMetadata);
        vi.spyOn(client.registry, 'enableForAgent').mockResolvedValue(mockResult);

        const result = await client.enablePermission({
          permissionId: createCustomPermissionId(1),
          gasBudget: 100000n,
        });

        expect(result.txHash).toBe('0xabc');
        expect(result.blockNumber).toBe(12345);
      });

      it('should throw if permission is not active', async () => {
        const mockMetadata = { ...createMockPermissionMetadata(1), active: false };

        vi.spyOn(client.registry, 'getPermissionMetadata').mockResolvedValue(mockMetadata);

        await expect(
          client.enablePermission({
            permissionId: createCustomPermissionId(1),
          })
        ).rejects.toThrow('not active');
      });

      it('should throw without wallet', async () => {
        const clientWithoutWallet = new MarketplaceClient({
          addresses: mockAddresses,
          rpcUrl: mockRpcUrl,
        });

        await expect(
          clientWithoutWallet.enablePermission({
            permissionId: createCustomPermissionId(1),
          })
        ).rejects.toThrow('Wallet required');
      });
    });

    describe('disablePermission', () => {
      it('should disable permission', async () => {
        const mockResult = { txHash: '0xdef', blockNumber: 12346 };

        vi.spyOn(client.registry, 'disableForAgent').mockResolvedValue(mockResult);

        const result = await client.disablePermission(createCustomPermissionId(1));

        expect(result.txHash).toBe('0xdef');
      });

      it('should throw without wallet', async () => {
        const clientWithoutWallet = new MarketplaceClient({
          addresses: mockAddresses,
          rpcUrl: mockRpcUrl,
        });

        await expect(
          clientWithoutWallet.disablePermission(createCustomPermissionId(1))
        ).rejects.toThrow('Wallet required');
      });
    });
  });

  describe('permission checking', () => {
    let client: MarketplaceClient;

    beforeEach(() => {
      client = new MarketplaceClient({
        addresses: mockAddresses,
        rpcUrl: mockRpcUrl,
      });
    });

    describe('checkPermissions', () => {
      it('should return allowed when all permissions pass', async () => {
        const mockResult: CustomPermissionCheckResult = {
          allowed: true,
        };

        vi.spyOn(client.registry, 'checkAllPermissions').mockResolvedValue(mockResult);

        const result = await client.checkPermissions(
          '0xAgent',
          'transfer',
          new Uint8Array()
        );

        expect(result.allowed).toBe(true);
      });

      it('should return denial info when permission fails', async () => {
        const mockResult: CustomPermissionCheckResult = {
          allowed: false,
          deniedByPermissionId: createCustomPermissionId(2),
          reason: 'Daily limit exceeded',
        };

        vi.spyOn(client.registry, 'checkAllPermissions').mockResolvedValue(mockResult);

        const result = await client.checkPermissions(
          '0xAgent',
          'transfer',
          new Uint8Array()
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Daily limit exceeded');
      });
    });

    describe('checkPermission', () => {
      it('should check single permission', async () => {
        const mockResult: CustomPermissionCheckResult = {
          allowed: true,
        };

        vi.spyOn(client.registry, 'checkPermission').mockResolvedValue(mockResult);

        const result = await client.checkPermission(
          '0xAgent',
          createCustomPermissionId(1),
          'transfer',
          new Uint8Array()
        );

        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('utilities', () => {
    it('should return registry instance', () => {
      const client = new MarketplaceClient({
        addresses: mockAddresses,
        rpcUrl: mockRpcUrl,
      });

      expect(client.getRegistry()).toBeInstanceOf(PermissionRegistry);
    });
  });
});

// ============================================================================
// CustomPermissionDeployer Tests
// ============================================================================

describe('CustomPermissionDeployer', () => {
  let deployer: CustomPermissionDeployer;
  let wallet: WalletAdapter;

  beforeEach(() => {
    wallet = createMockWallet();
    deployer = new CustomPermissionDeployer({
      addresses: mockAddresses,
      rpcUrl: mockRpcUrl,
      wallet,
    });
  });

  describe('initialization', () => {
    it('should create deployer with wallet', () => {
      expect(deployer).toBeDefined();
      expect(deployer.wallet).toBe(wallet);
    });

    it('should throw without wallet', () => {
      expect(() => {
        new CustomPermissionDeployer({
          addresses: mockAddresses,
          rpcUrl: mockRpcUrl,
          wallet: undefined as unknown as WalletAdapter,
        });
      }).toThrow('Wallet required');
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return all 8 templates', () => {
      const templates = deployer.getAvailableTemplates();

      expect(templates).toHaveLength(8);
      expect(templates).toContain('max-daily-spend');
      expect(templates).toContain('address-whitelist');
      expect(templates).toContain('address-blacklist');
      expect(templates).toContain('time-restricted');
      expect(templates).toContain('action-type-filter');
      expect(templates).toContain('value-threshold');
      expect(templates).toContain('rate-limiter');
      expect(templates).toContain('cooldown-enforcer');
    });
  });

  describe('getTemplateInfo', () => {
    it('should return info for max-daily-spend', () => {
      const info = deployer.getTemplateInfo('max-daily-spend');

      expect(info.name).toBe('Max Daily Spend');
      expect(info.description.toLowerCase()).toContain('day');
      expect(info.configSchema.maxDaily).toBeDefined();
      expect(info.configSchema.maxDaily.required).toBe(true);
      expect(info.configSchema.token).toBeDefined();
      expect(info.configSchema.token.required).toBe(false);
    });

    it('should return info for address-whitelist', () => {
      const info = deployer.getTemplateInfo('address-whitelist');

      expect(info.name).toBe('Address Whitelist');
      expect(info.configSchema.addresses.required).toBe(true);
      expect(info.configSchema.checkField.required).toBe(true);
    });

    it('should return info for address-blacklist', () => {
      const info = deployer.getTemplateInfo('address-blacklist');

      expect(info.name).toBe('Address Blacklist');
      expect(info.configSchema.addresses.required).toBe(true);
      expect(info.configSchema.checkField.required).toBe(true);
    });

    it('should return info for time-restricted', () => {
      const info = deployer.getTemplateInfo('time-restricted');

      expect(info.name).toBe('Time Restricted');
      expect(info.configSchema.startHour.required).toBe(true);
      expect(info.configSchema.endHour.required).toBe(true);
      expect(info.configSchema.allowedDays.required).toBe(false);
    });

    it('should return info for action-type-filter', () => {
      const info = deployer.getTemplateInfo('action-type-filter');

      expect(info.name).toBe('Action Type Filter');
      expect(info.configSchema.allowedPatterns.required).toBe(true);
      expect(info.configSchema.isBlocklist.required).toBe(false);
    });

    it('should return info for value-threshold', () => {
      const info = deployer.getTemplateInfo('value-threshold');

      expect(info.name).toBe('Value Threshold');
      expect(info.configSchema.maxValue.required).toBe(true);
      expect(info.configSchema.token.required).toBe(false);
    });

    it('should return info for rate-limiter', () => {
      const info = deployer.getTemplateInfo('rate-limiter');

      expect(info.name).toBe('Rate Limiter');
      expect(info.configSchema.maxActions.required).toBe(true);
      expect(info.configSchema.windowSeconds.required).toBe(true);
      expect(info.configSchema.perActionType.required).toBe(false);
    });

    it('should return info for cooldown-enforcer', () => {
      const info = deployer.getTemplateInfo('cooldown-enforcer');

      expect(info.name).toBe('Cooldown Enforcer');
      expect(info.configSchema.cooldownSeconds.required).toBe(true);
      expect(info.configSchema.actionTypes.required).toBe(false);
    });

    it('should throw for unknown template', () => {
      expect(() => {
        // @ts-expect-error Testing invalid input
        deployer.getTemplateInfo('unknown-template');
      }).toThrow('Unknown template');
    });
  });

  describe('validation', () => {
    it('should throw for empty name', async () => {
      await expect(
        deployer.deploy({
          name: '',
          description: 'Test description',
          version: '1.0.0',
          tags: ['test'],
          bytecode: '0x123',
        })
      ).rejects.toThrow('name is required');
    });

    it('should throw for empty description', async () => {
      await expect(
        deployer.deploy({
          name: 'Test',
          description: '',
          version: '1.0.0',
          tags: ['test'],
          bytecode: '0x123',
        })
      ).rejects.toThrow('description is required');
    });

    it('should throw for invalid version format', async () => {
      await expect(
        deployer.deploy({
          name: 'Test',
          description: 'Test description',
          version: 'v1',
          tags: ['test'],
          bytecode: '0x123',
        })
      ).rejects.toThrow('Valid semver version');
    });

    it('should accept valid semver version', async () => {
      // This will fail at bytecode validation stage, not version
      await expect(
        deployer.deploy({
          name: 'Test',
          description: 'Test description',
          version: '1.2.3',
          tags: ['test'],
          bytecode: '0x123',
        })
      ).rejects.not.toThrow('version');
    });

    it('should throw for bytecode without 0x prefix', async () => {
      await expect(
        deployer.deploy({
          name: 'Test',
          description: 'Test description',
          version: '1.0.0',
          tags: ['test'],
          bytecode: '123456',
        })
      ).rejects.toThrow('Valid bytecode');
    });
  });

  describe('template config validation', () => {
    it('should throw for missing required config', async () => {
      await expect(
        deployer.deployFromTemplate('max-daily-spend', {})
      ).rejects.toThrow('Missing required config: maxDaily');
    });

    it('should accept valid max-daily-spend config', async () => {
      // Will throw at the direct deployment level (not implemented),
      // but should pass config validation
      await expect(
        deployer.deployFromTemplate('max-daily-spend', {
          maxDaily: 1000000000000000000n,
        })
      ).rejects.toThrow('not yet implemented');
    });

    it('should accept valid address-whitelist config', async () => {
      await expect(
        deployer.deployFromTemplate('address-whitelist', {
          addresses: ['0x1234567890123456789012345678901234567890'],
          checkField: 'recipient',
        })
      ).rejects.toThrow('not yet implemented');
    });

    it('should accept valid time-restricted config', async () => {
      await expect(
        deployer.deployFromTemplate('time-restricted', {
          startHour: 9,
          endHour: 17,
        })
      ).rejects.toThrow('not yet implemented');
    });

    it('should accept valid rate-limiter config', async () => {
      await expect(
        deployer.deployFromTemplate('rate-limiter', {
          maxActions: 10,
          windowSeconds: 3600,
        })
      ).rejects.toThrow('not yet implemented');
    });

    it('should accept valid cooldown-enforcer config', async () => {
      await expect(
        deployer.deployFromTemplate('cooldown-enforcer', {
          cooldownSeconds: 60,
        })
      ).rejects.toThrow('not yet implemented');
    });
  });
});
