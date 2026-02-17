import type { WalletClient } from 'viem';
import type { VoteInput } from '@invariance/common';

/** EIP-712 domain for vote signing */
export interface VoteDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

/** EIP-712 types for a Vote */
const VOTE_TYPES = {
  Vote: [
    { name: 'proposalId', type: 'bytes32' },
    { name: 'voter', type: 'address' },
    { name: 'support', type: 'bool' },
    { name: 'weight', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

/**
 * Sign a vote using EIP-712 typed data.
 *
 * @param walletClient - Viem wallet client for signing
 * @param domain - EIP-712 domain parameters
 * @param input - Vote input (proposalId, support, weight)
 * @param voter - Voter address
 * @param nonce - Replay protection nonce
 * @returns EIP-712 signature hex string
 */
export async function signVote(
  walletClient: WalletClient,
  domain: VoteDomain,
  input: VoteInput,
  voter: `0x${string}`,
  nonce: bigint,
): Promise<string> {
  const signature = await walletClient.signTypedData({
    account: voter,
    domain,
    types: VOTE_TYPES,
    primaryType: 'Vote',
    message: {
      proposalId: input.proposalId as `0x${string}`,
      voter,
      support: input.support,
      weight: input.weight,
      nonce,
    },
  });

  return signature;
}

/**
 * Build the EIP-712 domain for the voting contract.
 *
 * @param chainId - Chain ID
 * @param contractAddress - Voting contract address
 * @returns VoteDomain
 */
export function buildVoteDomain(chainId: number, contractAddress: `0x${string}`): VoteDomain {
  return {
    name: 'InvarianceVoting',
    version: '1',
    chainId,
    verifyingContract: contractAddress,
  };
}
