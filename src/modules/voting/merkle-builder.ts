import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Vote, MerkleProofBundle } from '@invariance/common';

/** Leaf encoding: [voter: address, support: bool, weight: uint256] */
const LEAF_ENCODING = ['address', 'bool', 'uint256'] as const;

/**
 * Build a merkle tree from an array of votes.
 *
 * Uses OpenZeppelin's StandardMerkleTree which double-hashes leaves
 * (keccak256(bytes.concat(keccak256(abi.encode(...))))), matching the
 * on-chain MerkleProof.verify behavior.
 *
 * @param votes - Array of signed votes
 * @returns StandardMerkleTree instance
 */
export function buildMerkleTree(
  votes: Vote[],
): StandardMerkleTree<[string, boolean, bigint]> {
  const values: [string, boolean, bigint][] = votes.map((v) => [
    v.voter,
    v.support,
    v.weight,
  ]);

  return StandardMerkleTree.of(values, [...LEAF_ENCODING]);
}

/**
 * Generate a merkle proof for a specific vote.
 *
 * @param tree - The merkle tree
 * @param vote - The vote to generate a proof for
 * @returns MerkleProofBundle with proof, leaf, and root
 */
export function generateProof(
  tree: StandardMerkleTree<[string, boolean, bigint]>,
  vote: Vote,
): MerkleProofBundle {
  const value: [string, boolean, bigint] = [vote.voter, vote.support, vote.weight];

  // Find the leaf index
  let leafIndex = -1;
  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === value[0].toLowerCase() && v[1] === value[1] && v[2] === value[2]) {
      leafIndex = i;
      break;
    }
  }

  if (leafIndex === -1) {
    throw new Error(`Vote not found in tree for voter ${vote.voter}`);
  }

  const proof = tree.getProof(leafIndex);

  return {
    vote,
    proof,
    leaf: StandardMerkleTree.of([value], [...LEAF_ENCODING]).root, // single-leaf root = leaf hash
    root: tree.root,
  };
}

/**
 * Verify a merkle proof off-chain.
 *
 * @param root - Expected merkle root
 * @param vote - The vote to verify
 * @param proof - Merkle proof
 * @returns Whether the proof is valid
 */
export function verifyProofOffChain(
  root: string,
  vote: Vote,
  proof: string[],
): boolean {
  const value: [string, boolean, bigint] = [vote.voter, vote.support, vote.weight];
  return StandardMerkleTree.verify(root, [...LEAF_ENCODING], value, proof);
}
