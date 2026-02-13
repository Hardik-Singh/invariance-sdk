/**
 * invariance_verify — Verify any transaction's on-chain proof
 */

import { getInvariance } from '../index.js';

interface VerifyParams {
  tx_hash: string;
}

interface VerifyResult {
  verified: boolean;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  actor: { type: string; address: string };
  action: string;
  explorerUrl: string;
  message: string;
}

/**
 * Verify a transaction hash against the on-chain Invariance ledger.
 *
 * Returns verification status, block details, and a public explorer link
 * that anyone can use to independently confirm what happened.
 */
export async function verifyTx(params: VerifyParams): Promise<VerifyResult> {
  const inv = getInvariance();

  const verification = await inv.verify(params.tx_hash);

  return {
    verified: verification.verified,
    txHash: params.tx_hash,
    blockNumber: verification.blockNumber,
    timestamp: verification.timestamp,
    actor: { type: verification.actor.type, address: verification.actor.address },
    action: verification.action,
    explorerUrl: verification.explorerUrl,
    message: verification.verified
      ? `Transaction verified on-chain. View proof: ${verification.explorerUrl}`
      : `Transaction could NOT be verified. It may not have been executed through Invariance.`,
  };
}
