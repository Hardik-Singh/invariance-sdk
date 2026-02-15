/**
 * Agent/user relationship tracking via attestations.
 * BFS traversal of social connections for trust graphs.
 *
 * @example
 * ```typescript
 * const graph = new SocialGraphAdapter(inv);
 * await graph.linkAgents('identity-a', 'identity-b', 'trusts', 0.9);
 * const trust = graph.getTrustGraph('identity-a', 3);
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';

/** A link between two identities */
export interface SocialLink {
  /** Source identity ID */
  from: string;
  /** Target identity ID */
  to: string;
  /** Relationship type (e.g., 'trusts', 'delegates-to', 'collaborates-with') */
  relationship: string;
  /** Link strength (0.0 - 1.0) */
  strength: number;
  /** When the link was created */
  createdAt: number;
  /** Transaction hash of the attestation */
  txHash: string;
}

/** Trust graph node */
export interface TrustNode {
  /** Identity ID */
  identityId: string;
  /** Distance from the origin (in hops) */
  depth: number;
  /** Aggregated trust score at this depth */
  trustScore: number;
  /** Incoming links */
  incomingLinks: SocialLink[];
}

/** Trust graph result */
export interface TrustGraph {
  /** Origin identity */
  origin: string;
  /** All reachable nodes */
  nodes: TrustNode[];
  /** Total edges traversed */
  edgeCount: number;
  /** Maximum depth reached */
  maxDepth: number;
}

/**
 * SocialGraphAdapter — agent/user relationship tracking and trust graph traversal.
 */
export class SocialGraphAdapter {
  private readonly client: Invariance;
  private readonly adjacency = new Map<string, SocialLink[]>();

  constructor(client: Invariance) {
    this.client = client;
  }

  /**
   * Create a link between two identities with on-chain attestation.
   */
  async linkAgents(
    fromId: string,
    toId: string,
    relationship: string,
    strength: number,
  ): Promise<SocialLink> {
    if (strength < 0 || strength > 1) {
      throw new Error('Strength must be between 0.0 and 1.0');
    }

    const attestation = await this.client.identity.attest(fromId, {
      key: `social:${relationship}:${toId}`,
      value: JSON.stringify({ relationship, strength, target: toId }),
    });

    const link: SocialLink = {
      from: fromId,
      to: toId,
      relationship,
      strength,
      createdAt: Date.now(),
      txHash: attestation.txHash,
    };

    const existing = this.adjacency.get(fromId) ?? [];
    const idx = existing.findIndex((l) => l.to === toId && l.relationship === relationship);
    if (idx >= 0) {
      existing[idx] = link;
    } else {
      existing.push(link);
    }
    this.adjacency.set(fromId, existing);

    return link;
  }

  /**
   * Remove a link between two identities.
   */
  unlinkAgents(fromId: string, toId: string, relationship: string): boolean {
    const links = this.adjacency.get(fromId);
    if (!links) return false;
    const idx = links.findIndex((l) => l.to === toId && l.relationship === relationship);
    if (idx < 0) return false;
    links.splice(idx, 1);
    return true;
  }

  /**
   * Get direct links from an identity.
   */
  getLinks(identityId: string): SocialLink[] {
    return this.adjacency.get(identityId) ?? [];
  }

  /**
   * BFS traversal to build a trust graph from an origin identity.
   */
  getTrustGraph(origin: string, maxDepth: number = 3, minStrength: number = 0.1): TrustGraph {
    const visited = new Map<string, TrustNode>();
    const queue: Array<{ id: string; depth: number; trustScore: number }> = [
      { id: origin, depth: 0, trustScore: 1.0 },
    ];
    let edgeCount = 0;
    let actualMaxDepth = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      if (current.depth > maxDepth) continue;

      actualMaxDepth = Math.max(actualMaxDepth, current.depth);

      // Find incoming links
      const incomingLinks: SocialLink[] = [];
      for (const [, links] of this.adjacency) {
        for (const link of links) {
          if (link.to === current.id) {
            incomingLinks.push(link);
          }
        }
      }

      visited.set(current.id, {
        identityId: current.id,
        depth: current.depth,
        trustScore: Math.round(current.trustScore * 1000) / 1000,
        incomingLinks,
      });

      // Enqueue neighbors
      const outLinks = this.adjacency.get(current.id) ?? [];
      for (const link of outLinks) {
        if (!visited.has(link.to) && link.strength >= minStrength) {
          edgeCount++;
          queue.push({
            id: link.to,
            depth: current.depth + 1,
            trustScore: current.trustScore * link.strength,
          });
        }
      }
    }

    return {
      origin,
      nodes: [...visited.values()],
      edgeCount,
      maxDepth: actualMaxDepth,
    };
  }

  /**
   * Get mutual connections between two identities.
   */
  getMutualConnections(idA: string, idB: string): string[] {
    const aTargets = new Set((this.adjacency.get(idA) ?? []).map((l) => l.to));
    const bTargets = (this.adjacency.get(idB) ?? []).map((l) => l.to);
    return bTargets.filter((t) => aTargets.has(t));
  }
}
