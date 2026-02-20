import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimestampManager } from '../TimestampManager.js';
import type { TimestampProof } from '../types.js';
import type { Telemetry } from '../../../core/Telemetry.js';

const mockStamp = vi.fn();
const mockUpgrade = vi.fn();
const mockVerify = vi.fn();

const mockSerializedBytes = new Uint8Array([1, 2, 3, 4]);
const mockUpgradedBytes = new Uint8Array([5, 6, 7, 8]);

const mockDetachedFile = {
  serializeToBytes: vi.fn(() => mockSerializedBytes),
};

const mockUpgradedFile = {
  serializeToBytes: vi.fn(() => mockUpgradedBytes),
};

const mockOTS = {
  DetachedTimestampFile: {
    fromHash: vi.fn(() => mockDetachedFile),
    deserialize: vi.fn(() => mockUpgradedFile),
  },
  Ops: {
    OpSHA256: vi.fn(),
  },
  stamp: mockStamp,
  upgrade: mockUpgrade,
  verify: mockVerify,
};

/** Test subclass that overrides _loadOTS to return the mock */
class TestableTimestampManager extends TimestampManager {
  protected override async _loadOTS() {
    return mockOTS;
  }
}

function makeTelemetry(): Telemetry {
  return { track: vi.fn() } as unknown as Telemetry;
}

const TEST_HASH = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

describe('TimestampManager', () => {
  let manager: TestableTimestampManager;
  let telemetry: Telemetry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDetachedFile.serializeToBytes.mockReturnValue(mockSerializedBytes);
    mockUpgradedFile.serializeToBytes.mockReturnValue(mockUpgradedBytes);
    telemetry = makeTelemetry();
    manager = new TestableTimestampManager({}, telemetry);
  });

  describe('stamp', () => {
    it('should submit a hash and return a pending proof', async () => {
      mockStamp.mockResolvedValue(undefined);

      const proof = await manager.stamp(TEST_HASH);

      expect(mockOTS.DetachedTimestampFile.fromHash).toHaveBeenCalled();
      expect(mockStamp).toHaveBeenCalledWith(mockDetachedFile, {});
      expect(proof.status).toBe('pending');
      expect(proof.hash).toBe(TEST_HASH);
      expect(proof.otsData).toBe(Buffer.from(mockSerializedBytes).toString('base64'));
      expect(proof.createdAt).toBeGreaterThan(0);
    });

    it('should pass custom calendars to OTS', async () => {
      mockStamp.mockResolvedValue(undefined);
      const customManager = new TestableTimestampManager(
        { calendars: ['https://my-calendar.example.com'] },
        telemetry,
      );

      await customManager.stamp(TEST_HASH);

      expect(mockStamp).toHaveBeenCalledWith(mockDetachedFile, {
        calendars: ['https://my-calendar.example.com'],
      });
    });

    it('should track telemetry', async () => {
      mockStamp.mockResolvedValue(undefined);
      await manager.stamp(TEST_HASH);
      expect(telemetry.track).toHaveBeenCalledWith(
        'timestamp.stamp',
        { hash: 'abcdef1234567890' },
      );
    });
  });

  describe('upgrade', () => {
    const pendingProof: TimestampProof = {
      hash: TEST_HASH,
      otsData: Buffer.from(mockSerializedBytes).toString('base64'),
      status: 'pending',
      createdAt: Date.now(),
    };

    it('should return the same proof if already verified', async () => {
      const verified: TimestampProof = { ...pendingProof, status: 'verified' };
      const result = await manager.upgrade(verified);
      expect(result).toBe(verified);
      expect(mockUpgrade).not.toHaveBeenCalled();
    });

    it('should return unchanged proof if upgrade returns false', async () => {
      mockUpgrade.mockResolvedValue(false);
      const result = await manager.upgrade(pendingProof);
      expect(result).toEqual(pendingProof);
    });

    it('should upgrade proof when OTS returns true', async () => {
      mockUpgrade.mockResolvedValue(true);
      mockVerify.mockResolvedValue({ bitcoin: 850000 });

      const result = await manager.upgrade(pendingProof);

      expect(result.status).toBe('verified');
      expect(result.otsData).toBe(Buffer.from(mockUpgradedBytes).toString('base64'));
      expect(result.bitcoinBlockHeight).toBe(850000);
    });
  });

  describe('verify', () => {
    const proof: TimestampProof = {
      hash: TEST_HASH,
      otsData: Buffer.from(mockSerializedBytes).toString('base64'),
      status: 'verified',
      bitcoinBlockHeight: 850000,
      createdAt: Date.now(),
    };

    it('should return invalid if hashes do not match', async () => {
      const result = await manager.verify('different_hash', proof);
      expect(result.valid).toBe(false);
    });

    it('should return valid with attestation info for verified proofs', async () => {
      mockVerify.mockResolvedValue({ bitcoin: 1700000000 });

      const result = await manager.verify(proof.hash, proof);

      expect(result.valid).toBe(true);
      expect(result.attestedTime).toBe(1700000000);
    });

    it('should return valid=true for pending proofs with empty results', async () => {
      const pending: TimestampProof = { ...proof, status: 'pending' };
      mockVerify.mockResolvedValue({});

      const result = await manager.verify(pending.hash, pending);
      expect(result.valid).toBe(true);
    });

    it('should return invalid on verification error', async () => {
      mockVerify.mockRejectedValue(new Error('verification failed'));
      const result = await manager.verify(proof.hash, proof);
      expect(result.valid).toBe(false);
    });
  });

  describe('stampEntry', () => {
    it('should hash entry content and stamp it', async () => {
      mockStamp.mockResolvedValue(undefined);

      const entry = {
        entryId: 'test-1',
        action: 'swap',
        actor: { type: 'agent' as const, address: '0xBot' },
        category: 'execution',
        severity: 'info' as const,
        timestamp: 1700000000000,
        createdAt: '2023-11-14T00:00:00Z',
      };

      const proof = await manager.stampEntry(entry);

      expect(proof.status).toBe('pending');
      expect(proof.hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
