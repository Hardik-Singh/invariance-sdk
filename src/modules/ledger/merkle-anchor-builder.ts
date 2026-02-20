import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

/**
 * Leaf encoding for merkle anchor entries.
 * Matches the CompactLogInput fields used for on-chain verification.
 */
const LEAF_ENCODING = [
  'bytes32',  // actorIdentityId
  'address',  // actorAddress
  'string',   // action
  'string',   // category
  'bytes32',  // metadataHash
  'bytes32',  // proofHash
  'uint8',    // severity
  'uint256',  // leafIndex
] as const;

/** Leaf value tuple type */
export type AnchorLeafValue = [
  string,   // actorIdentityId
  string,   // actorAddress
  string,   // action
  string,   // category
  string,   // metadataHash
  string,   // proofHash
  number,   // severity
  bigint,   // leafIndex
];

/** Result of building an anchor merkle tree */
export interface AnchorTreeResult {
  /** Merkle root hash */
  root: string;
  /** Proof for each leaf */
  proofs: string[][];
  /** Leaf values */
  leaves: AnchorLeafValue[];
}

/**
 * Build a merkle tree from an array of anchor leaf values.
 *
 * Uses OpenZeppelin's StandardMerkleTree which double-hashes leaves,
 * matching the on-chain MerkleProof.verify behavior.
 *
 * @param leafValues - Array of leaf value tuples
 * @returns Tree root, proofs for each leaf, and the leaves
 */
export function buildAnchorTree(leafValues: AnchorLeafValue[]): AnchorTreeResult {
  const tree = StandardMerkleTree.of(leafValues, [...LEAF_ENCODING]);

  const proofs: string[][] = [];
  for (let i = 0; i < leafValues.length; i++) {
    proofs.push(tree.getProof(i));
  }

  return {
    root: tree.root,
    proofs,
    leaves: leafValues,
  };
}

/**
 * Verify a merkle proof for an anchor leaf off-chain.
 *
 * @param root - Expected merkle root
 * @param value - The leaf value tuple to verify
 * @param proof - Merkle proof
 * @returns Whether the proof is valid
 */
export function verifyAnchorLeafOffChain(
  root: string,
  value: AnchorLeafValue,
  proof: string[],
): boolean {
  return StandardMerkleTree.verify(root, [...LEAF_ENCODING], value, proof);
}
