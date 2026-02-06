/**
 * Anonymized telemetry collector for SDK usage metrics.
 *
 * When enabled, collects non-identifying usage data such as method call counts,
 * error rates, and latency distributions. All data is anonymized and contains
 * no wallet addresses, transaction hashes, or personally identifiable information.
 *
 * Telemetry is opt-out: enabled by default but can be disabled via config.
 */
export class Telemetry {
  private readonly enabled: boolean;
  private buffer: TelemetryEvent[] = [];
  private static readonly MAX_BUFFER_SIZE = 100;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Track an anonymized telemetry event.
   *
   * @param event - Event name (e.g., 'identity.register', 'intent.request')
   * @param data - Anonymized event data (no PII, no addresses, no hashes)
   */
  track(event: string, data?: Record<string, unknown>): void {
    if (!this.enabled) return;

    this.buffer.push({
      event,
      data: data ?? {},
      timestamp: Date.now(),
    });

    // Auto-flush when buffer is full
    if (this.buffer.length >= Telemetry.MAX_BUFFER_SIZE) {
      void this.flush();
    }
  }

  /**
   * Flush buffered telemetry events.
   *
   * In V1 this is a no-op stub. Future versions will send to
   * the Invariance telemetry endpoint.
   */
  async flush(): Promise<void> {
    if (!this.enabled || this.buffer.length === 0) return;

    // TODO: Send to telemetry endpoint in V2
    // const events = [...this.buffer];
    this.buffer = [];
  }
}

/** Internal telemetry event structure */
interface TelemetryEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}
