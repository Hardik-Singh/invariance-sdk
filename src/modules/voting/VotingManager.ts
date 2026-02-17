import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import type {
  Vote,
  Proposal,
  VoteInput,
  CreateProposalOptions,
  MerkleProofBundle,
  SettlementData,
} from '@invariance/common';
import { toBytes32, fromBytes32, mapContractError } from '../../utils/contract-helpers.js';
import { signVote, buildVoteDomain } from './vote-signing.js';
import { buildMerkleTree, generateProof, verifyProofOffChain } from './merkle-builder.js';
import type { StandardMerkleTree } from '@openzeppelin/merkle-tree';

/**
 * Off-chain batch voting with merkle root settlement.
 *
 * Proposals are created on-chain for immutability. Votes are collected
 * off-chain as EIP-712 signed messages. A single merkle root posted
 * on-chain proves all votes (95%+ gas savings vs individual storage).
 *
 * @example
 * ```typescript
 * // Create a proposal
 * await inv.voting.createProposal({
 *   proposalId: 'prop-1',
 *   identityId: 'id-1',
 *   title: 'Upgrade to v2',
 *   descriptionHash: '0x...',
 *   votingPeriod: 7 * 24 * 3600,
 *   quorum: 100n,
 *   threshold: 5000,
 * });
 *
 * // Cast votes off-chain
 * const vote = await inv.voting.castVote({ proposalId: 'prop-1', support: true, weight: 50n });
 *
 * // Settle with merkle root
 * await inv.voting.settleVotes('prop-1');
 *
 * // Verify any vote
 * const proof = inv.voting.generateProof('prop-1', vote.voter);
 * const valid = await inv.voting.verifyVote('prop-1', proof);
 * ```
 */
export class VotingManager {
  private readonly contracts: ContractFactory;
  private readonly telemetry: Telemetry;

  /** In-memory vote storage per proposal */
  private readonly voteStore: Map<string, Vote[]> = new Map();

  /** Cached merkle trees per proposal */
  private readonly treeCache: Map<string, StandardMerkleTree<[string, boolean, bigint]>> = new Map();

  constructor(
    contracts: ContractFactory,
    _events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.telemetry = telemetry;
  }

  /**
   * Create a proposal on-chain.
   *
   * @param opts - Proposal creation options
   * @returns Transaction hash
   */
  async createProposal(opts: CreateProposalOptions): Promise<string> {
    this.telemetry.track('voting.createProposal');

    try {
      const votingContract = this.contracts.getContract('voting');
      const writeFn = votingContract.write['createProposal'];
      if (!writeFn) {
        throw new Error('createProposal function not found on voting contract');
      }

      const txHash = await writeFn([
        toBytes32(opts.proposalId),
        toBytes32(opts.identityId),
        opts.title,
        opts.descriptionHash as `0x${string}`,
        BigInt(opts.votingPeriod),
        opts.quorum,
        BigInt(opts.threshold),
      ]);

      // Initialize vote storage
      this.voteStore.set(opts.proposalId, []);

      return txHash as string;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Cast a vote off-chain with EIP-712 signature.
   *
   * The vote is signed and stored in memory. No on-chain transaction
   * occurs until settleVotes() is called.
   *
   * @param input - Vote input (proposalId, support, weight)
   * @returns The signed vote
   */
  async castVote(input: VoteInput): Promise<Vote> {
    this.telemetry.track('voting.castVote');

    const walletClient = this.contracts.getWalletClient();
    const voter = walletClient.account?.address;
    if (!voter) {
      throw new Error('No wallet connected — cannot sign vote');
    }

    const chainId = this.contracts.getChainId();
    const votingAddress = this.contracts.getAddress('voting') as `0x${string}`;
    const domain = buildVoteDomain(chainId, votingAddress);

    // Get nonce (number of existing votes by this voter for this proposal)
    const existing = this.voteStore.get(input.proposalId) ?? [];
    const nonce = BigInt(existing.filter((v) => v.voter.toLowerCase() === voter.toLowerCase()).length);

    const signature = await signVote(walletClient, domain, input, voter, nonce);

    const vote: Vote = {
      proposalId: input.proposalId,
      voter,
      support: input.support,
      weight: input.weight,
      nonce,
      signature,
    };

    // Store vote
    if (!this.voteStore.has(input.proposalId)) {
      this.voteStore.set(input.proposalId, []);
    }
    this.voteStore.get(input.proposalId)!.push(vote);

    // Invalidate tree cache
    this.treeCache.delete(input.proposalId);

    return vote;
  }

  /**
   * Build the merkle tree for a proposal's votes.
   *
   * @param proposalId - The proposal ID
   * @returns The merkle root
   */
  buildMerkleTree(proposalId: string): string {
    const votes = this.voteStore.get(proposalId);
    if (!votes || votes.length === 0) {
      throw new Error(`No votes found for proposal: ${proposalId}`);
    }

    const tree = buildMerkleTree(votes);
    this.treeCache.set(proposalId, tree);
    return tree.root;
  }

  /**
   * Settle votes on-chain by posting the merkle root.
   *
   * Builds the merkle tree, computes totals, and submits a single
   * transaction to the contract.
   *
   * @param proposalId - The proposal to settle
   * @returns Settlement data including tx hash
   */
  async settleVotes(proposalId: string): Promise<SettlementData & { txHash: string }> {
    this.telemetry.track('voting.settleVotes');

    const votes = this.voteStore.get(proposalId);
    if (!votes || votes.length === 0) {
      throw new Error(`No votes found for proposal: ${proposalId}`);
    }

    // Build tree
    const merkleRoot = this.buildMerkleTree(proposalId);

    // Compute totals
    let totalFor = 0n;
    let totalAgainst = 0n;
    for (const vote of votes) {
      if (vote.support) {
        totalFor += vote.weight;
      } else {
        totalAgainst += vote.weight;
      }
    }

    try {
      const votingContract = this.contracts.getContract('voting');
      const writeFn = votingContract.write['settleVotes'];
      if (!writeFn) {
        throw new Error('settleVotes function not found on voting contract');
      }

      const txHash = await writeFn([
        toBytes32(proposalId),
        merkleRoot as `0x${string}`,
        totalFor,
        totalAgainst,
      ]);

      return {
        proposalId,
        merkleRoot,
        totalFor,
        totalAgainst,
        txHash: txHash as string,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Generate a merkle proof for a specific voter.
   *
   * @param proposalId - The proposal ID
   * @param voter - Voter address
   * @returns Merkle proof bundle
   */
  generateProof(proposalId: string, voter: string): MerkleProofBundle {
    this.telemetry.track('voting.generateProof');

    let tree = this.treeCache.get(proposalId);
    if (!tree) {
      this.buildMerkleTree(proposalId);
      tree = this.treeCache.get(proposalId)!;
    }

    const votes = this.voteStore.get(proposalId)!;
    const vote = votes.find((v) => v.voter.toLowerCase() === voter.toLowerCase());
    if (!vote) {
      throw new Error(`No vote found for voter ${voter} in proposal ${proposalId}`);
    }

    return generateProof(tree, vote);
  }

  /**
   * Verify a vote on-chain using a merkle proof.
   *
   * @param proposalId - The proposal ID
   * @param bundle - Merkle proof bundle
   * @returns Whether the vote is valid
   */
  async verifyVote(proposalId: string, bundle: MerkleProofBundle): Promise<boolean> {
    this.telemetry.track('voting.verifyVote');

    try {
      const votingContract = this.contracts.getContract('voting');
      const readFn = votingContract.read['verifyVote'];
      if (!readFn) {
        throw new Error('verifyVote function not found on voting contract');
      }

      const result = await readFn([
        toBytes32(proposalId),
        bundle.vote.voter as `0x${string}`,
        bundle.vote.support,
        bundle.vote.weight,
        bundle.proof as `0x${string}`[],
      ]);

      return result as boolean;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Verify a vote off-chain using the merkle proof.
   *
   * @param root - Expected merkle root
   * @param vote - The vote to verify
   * @param proof - Merkle proof
   * @returns Whether the proof is valid
   */
  verifyVoteOffChain(root: string, vote: Vote, proof: string[]): boolean {
    this.telemetry.track('voting.verifyVoteOffChain');
    return verifyProofOffChain(root, vote, proof);
  }

  /**
   * Get a proposal from the contract.
   *
   * @param proposalId - The proposal ID
   * @returns Proposal data
   */
  async getProposal(proposalId: string): Promise<Proposal> {
    this.telemetry.track('voting.getProposal');

    try {
      const votingContract = this.contracts.getContract('voting');
      const readFn = votingContract.read['getProposal'];
      if (!readFn) {
        throw new Error('getProposal function not found on voting contract');
      }

      const raw = await readFn([toBytes32(proposalId)]) as {
        identityId: `0x${string}`;
        title: string;
        descriptionHash: `0x${string}`;
        votingPeriod: bigint;
        quorum: bigint;
        threshold: bigint;
        createdAt: bigint;
        merkleRoot: `0x${string}`;
        totalFor: bigint;
        totalAgainst: bigint;
        settled: boolean;
      };

      return {
        proposalId,
        identityId: fromBytes32(raw.identityId),
        title: raw.title,
        descriptionHash: raw.descriptionHash,
        votingPeriod: Number(raw.votingPeriod),
        quorum: raw.quorum,
        threshold: Number(raw.threshold),
        createdAt: Number(raw.createdAt),
        merkleRoot: raw.merkleRoot,
        totalFor: raw.totalFor,
        totalAgainst: raw.totalAgainst,
        settled: raw.settled,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Get all in-memory votes for a proposal.
   *
   * @param proposalId - The proposal ID
   * @returns Array of votes
   */
  getVotes(proposalId: string): Vote[] {
    return this.voteStore.get(proposalId) ?? [];
  }

  /**
   * Check if a settled proposal passed (on-chain).
   *
   * @param proposalId - The proposal ID
   * @returns Whether the proposal passed
   */
  async didPass(proposalId: string): Promise<boolean> {
    this.telemetry.track('voting.didPass');

    try {
      const votingContract = this.contracts.getContract('voting');
      const readFn = votingContract.read['didPass'];
      if (!readFn) {
        throw new Error('didPass function not found on voting contract');
      }

      return await readFn([toBytes32(proposalId)]) as boolean;
    } catch (err) {
      throw mapContractError(err);
    }
  }
}
