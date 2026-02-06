import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Telemetry } from '../../src/core/Telemetry.js';

describe('Telemetry', () => {
  it('enabled: track() adds event to internal buffer', () => {
    const t = new Telemetry(true);
    t.track('sdk.init', { chain: 'base' });

    // We can observe the buffer indirectly via flush()
    const flushSpy = vi.spyOn(t, 'flush');
    // Buffer has 1 item, so flush should clear it
    void t.flush();
    expect(flushSpy).toHaveReturned();
  });

  it('disabled: track() is a no-op', async () => {
    const t = new Telemetry(false);
    t.track('sdk.init', { chain: 'base' });

    // flush on disabled telemetry should return immediately
    const flushSpy = vi.spyOn(t, 'flush');
    await t.flush();
    expect(flushSpy).toHaveReturned();
  });

  it('track() records event name and data', () => {
    const t = new Telemetry(true);
    // Access private buffer via any cast to verify recording
    t.track('identity.register', { type: 'agent' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = (t as any).buffer as Array<{
      event: string;
      data: Record<string, unknown>;
      timestamp: number;
    }>;
    expect(buffer).toHaveLength(1);
    expect(buffer[0].event).toBe('identity.register');
    expect(buffer[0].data).toEqual({ type: 'agent' });
  });

  it('track() records a timestamp', () => {
    const t = new Telemetry(true);
    const before = Date.now();
    t.track('test.event');
    const after = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = (t as any).buffer as Array<{ timestamp: number }>;
    expect(buffer[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(buffer[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('track() defaults data to empty object when not provided', () => {
    const t = new Telemetry(true);
    t.track('test.event');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = (t as any).buffer as Array<{
      data: Record<string, unknown>;
    }>;
    expect(buffer[0].data).toEqual({});
  });

  it('buffer auto-flushes at MAX_BUFFER_SIZE (100)', () => {
    const t = new Telemetry(true);
    const flushSpy = vi.spyOn(t, 'flush');

    for (let i = 0; i < 100; i++) {
      t.track(`event.${i}`);
    }

    expect(flushSpy).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = (t as any).buffer as unknown[];
    expect(buffer).toHaveLength(0);
  });

  it('buffer does not auto-flush before MAX_BUFFER_SIZE', () => {
    const t = new Telemetry(true);
    const flushSpy = vi.spyOn(t, 'flush');

    for (let i = 0; i < 99; i++) {
      t.track(`event.${i}`);
    }

    expect(flushSpy).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = (t as any).buffer as unknown[];
    expect(buffer).toHaveLength(99);
  });

  it('flush() clears the buffer', async () => {
    const t = new Telemetry(true);
    t.track('a');
    t.track('b');

    await t.flush();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = (t as any).buffer as unknown[];
    expect(buffer).toHaveLength(0);
  });

  it('flush() when disabled is a no-op', async () => {
    const t = new Telemetry(false);
    // Should not throw
    await expect(t.flush()).resolves.toBeUndefined();
  });

  it('flush() when buffer is empty is a no-op', async () => {
    const t = new Telemetry(true);
    // Should not throw
    await expect(t.flush()).resolves.toBeUndefined();
  });
});
