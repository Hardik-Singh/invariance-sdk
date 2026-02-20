import type {
  GraphIntelligenceConfig,
  GraphQueryOptions,
  AnomalyDetectionOptions,
  AnomalyHistoryOptions,
  CrossChainLinkOptions,
} from './types.js';
import type { GraphSnapshot, GraphAnomaly, CrossChainEntity, GraphExportFormat } from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { IndexerClient } from '../../utils/indexer-client.js';

/**
 * GraphIntelligence provides access to the risk intelligence graph,
 * including subgraph queries, anomaly detection, graph export, and
 * cross-chain entity linking.
 *
 * @example
 * ```typescript
 * const graph = new GraphIntelligence({ apiUrl: '...', apiKey: '...' });
 * const subgraph = await graph.getSubgraph({ address: '0x...', depth: 2 });
 * const anomalies = await graph.detectAnomalies({ address: '0x...' });
 * ```
 */
export class GraphIntelligence {
  private readonly config: GraphIntelligenceConfig;
  private readonly client: IndexerClient;
  private readonly hasV1Prefix: boolean;

  constructor(config: GraphIntelligenceConfig) {
    this.config = config;
    this.client = new IndexerClient(config.apiUrl, config.apiKey);
    this.hasV1Prefix = config.apiUrl.replace(/\/$/, '').endsWith('/v1');
  }

  /**
   * Get a subgraph centered on an address.
   * @param options - Query options
   * @returns Graph snapshot with nodes and edges
   */
  async getSubgraph(options: GraphQueryOptions): Promise<GraphSnapshot> {
    return this.client.get<GraphSnapshot>(`/graph/${options.address}`, {
      depth: options.depth ?? 2,
      includeRiskScores: options.includeRiskScores ? 1 : undefined,
    });
  }

  /**
   * Detect anomalies in the graph around an address.
   * @param options - Detection options
   * @returns Array of detected anomalies
   */
  async detectAnomalies(options: AnomalyDetectionOptions): Promise<GraphAnomaly[]> {
    return this.client.get<GraphAnomaly[]>(`/graph/${options.address}/anomalies`, {
      types: options.types?.join(','),
    });
  }

  /**
   * Read persisted anomaly history for an address.
   * @param options - History query options
   * @returns Array of historical anomalies
   */
  async getAnomalyHistory(options: AnomalyHistoryOptions): Promise<GraphAnomaly[]> {
    return this.client.get<GraphAnomaly[]>(`/graph/${options.address}/anomalies/history`, {
      type: options.type,
      limit: options.limit,
    });
  }

  /**
   * Export a subgraph in a given format.
   * @param address - Center address
   * @param depth - Subgraph depth
   * @param format - Export format
   * @returns Exported graph as string
   */
  async exportGraph(address: string, depth: number, format: GraphExportFormat): Promise<string> {
    const url = new URL(this.buildUrl('/graph/export'));
    url.searchParams.set('address', address);
    url.searchParams.set('depth', String(depth));
    url.searchParams.set('format', format);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        `Graph export failed: ${response.status} ${response.statusText}`,
      );
    }

    if (format === 'json') {
      const payload = await response.json() as { data?: unknown };
      return JSON.stringify(payload.data ?? payload);
    }

    return response.text();
  }

  /**
   * Link addresses across chains to a single entity.
   * @param options - Cross-chain link options
   * @returns The linked cross-chain entity
   */
  async linkCrossChain(options: CrossChainLinkOptions): Promise<CrossChainEntity> {
    return this.client.post<CrossChainEntity>('/graph/cross-chain/link', {
      entityId: options.entityId,
      addresses: options.addresses,
    });
  }

  /**
   * Get the cross-chain entity linked to an address.
   * @param address - Address to look up
   * @returns The cross-chain entity, or null
   */
  async getLinkedEntity(address: string): Promise<CrossChainEntity | null> {
    const response = await fetch(this.buildUrl(`/graph/cross-chain/${address}`), {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        `Cross-chain lookup failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json() as { data?: CrossChainEntity };
    return payload.data ?? null;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'x-api-key': this.config.apiKey,
    };
  }

  private buildUrl(path: string): string {
    const base = this.config.apiUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (this.hasV1Prefix) {
      return `${base}${normalizedPath.startsWith('/v1') ? normalizedPath.slice(3) : normalizedPath}`;
    }
    return `${base}${normalizedPath.startsWith('/v1') ? normalizedPath : `/v1${normalizedPath}`}`;
  }
}
