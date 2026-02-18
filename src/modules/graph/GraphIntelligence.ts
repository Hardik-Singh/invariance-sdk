import type {
  GraphIntelligenceConfig,
  GraphQueryOptions,
  AnomalyDetectionOptions,
  CrossChainLinkOptions,
} from './types.js';
import type { GraphSnapshot, GraphAnomaly, CrossChainEntity, GraphExportFormat } from '@invariance/common';

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
  private config: GraphIntelligenceConfig;

  constructor(config: GraphIntelligenceConfig) {
    this.config = config;
  }

  /**
   * Get a subgraph centered on an address.
   * @param options - Query options
   * @returns Graph snapshot with nodes and edges
   */
  async getSubgraph(options: GraphQueryOptions): Promise<GraphSnapshot> {
    // TODO: GET /graph/:address?depth=N using this.config.apiUrl
    void this.config;
    void options;
    throw new Error('GraphIntelligence.getSubgraph not implemented');
  }

  /**
   * Detect anomalies in the graph around an address.
   * @param options - Detection options
   * @returns Array of detected anomalies
   */
  async detectAnomalies(options: AnomalyDetectionOptions): Promise<GraphAnomaly[]> {
    // TODO: GET /graph/:address/anomalies
    void options;
    throw new Error('GraphIntelligence.detectAnomalies not implemented');
  }

  /**
   * Export a subgraph in a given format.
   * @param address - Center address
   * @param depth - Subgraph depth
   * @param format - Export format
   * @returns Exported graph as string
   */
  async exportGraph(address: string, depth: number, format: GraphExportFormat): Promise<string> {
    // TODO: GET /graph/export?address=X&depth=N&format=F
    void address;
    void depth;
    void format;
    throw new Error('GraphIntelligence.exportGraph not implemented');
  }

  /**
   * Link addresses across chains to a single entity.
   * @param options - Cross-chain link options
   * @returns The linked cross-chain entity
   */
  async linkCrossChain(options: CrossChainLinkOptions): Promise<CrossChainEntity> {
    // TODO: POST /graph/cross-chain/link
    void options;
    throw new Error('GraphIntelligence.linkCrossChain not implemented');
  }

  /**
   * Get the cross-chain entity linked to an address.
   * @param address - Address to look up
   * @returns The cross-chain entity, or null
   */
  async getLinkedEntity(address: string): Promise<CrossChainEntity | null> {
    // TODO: GET /graph/cross-chain/:address
    void address;
    throw new Error('GraphIntelligence.getLinkedEntity not implemented');
  }
}
