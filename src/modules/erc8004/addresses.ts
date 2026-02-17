/**
 * Canonical ERC-8004 registry addresses per chain.
 *
 * **IMPORTANT — Testnet placeholders only.**
 * The addresses below are synthetic pre-deployment values (sequential hex pattern).
 * They do NOT correspond to deployed contracts. Before using ERC-8004 features in
 * production, you **must** override these with real deployed addresses via
 * `Invariance({ erc8004: { addresses: { identity, reputation, validation } } })`.
 *
 * @todo Replace with actual deployed contract addresses after ERC-8004 registry deployment.
 */

import type { ERC8004RegistryAddresses } from './types.js';

/** Known ERC-8004 registry addresses by chain ID */
export const ERC8004_REGISTRY_ADDRESSES: Record<number, ERC8004RegistryAddresses> = {
  // Ethereum mainnet
  1: {
    identity: '0x1A2b3C4d5E6f7A8b9C0D1e2F3a4B5c6D7E8f9A0b' as `0x${string}`,
    reputation: '0x2B3c4D5e6F7a8B9c0D1E2f3A4b5C6d7E8F9a0B1c' as `0x${string}`,
    validation: '0x3C4d5E6f7A8b9C0d1E2F3a4B5c6D7e8F9A0b1C2d' as `0x${string}`,
  },
  // Base mainnet
  8453: {
    identity: '0x4D5e6F7a8B9c0D1e2F3A4b5C6d7E8f9A0B1c2D3e' as `0x${string}`,
    reputation: '0x5E6f7A8b9C0d1E2F3a4B5c6D7e8F9a0B1C2d3E4f' as `0x${string}`,
    validation: '0x6F7a8B9c0D1e2F3A4b5C6d7E8f9A0b1C2D3e4F5a' as `0x${string}`,
  },
  // Base Sepolia
  84532: {
    identity: '0x7A8b9C0d1E2f3A4B5c6D7e8F9a0B1c2D3E4f5A6b' as `0x${string}`,
    reputation: '0x8B9c0D1e2F3a4B5C6d7E8f9A0b1C2d3E4F5a6B7c' as `0x${string}`,
    validation: '0x9C0d1E2f3A4b5C6D7e8F9a0B1c2D3e4F5A6b7C8d' as `0x${string}`,
  },
};

/**
 * Get ERC-8004 registry addresses for a given chain.
 *
 * @param chainId - The chain ID
 * @returns Registry addresses or undefined if not supported
 */
export function getERC8004Addresses(chainId: number): ERC8004RegistryAddresses | undefined {
  return ERC8004_REGISTRY_ADDRESSES[chainId];
}

/**
 * Check if ERC-8004 is supported on a given chain.
 *
 * @param chainId - The chain ID
 * @returns Whether ERC-8004 registries are deployed on this chain
 */
export function isERC8004Supported(chainId: number): boolean {
  return chainId in ERC8004_REGISTRY_ADDRESSES;
}
