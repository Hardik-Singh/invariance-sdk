import type { InvarianceConfig } from '@invariance/common';
import { ContractFactory } from '../../src/core/ContractFactory.js';
import { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import { Telemetry } from '../../src/core/Telemetry.js';

/** Base Sepolia config fixture */
export const BASE_SEPOLIA_CONFIG: InvarianceConfig = {
  chain: 'base-sepolia',
};

/** Base mainnet config fixture */
export const BASE_CONFIG: InvarianceConfig = {
  chain: 'base',
};

/** Create a real ContractFactory with sensible defaults */
export function createContractFactory(
  overrides?: Partial<InvarianceConfig>,
): ContractFactory {
  return new ContractFactory({ ...BASE_SEPOLIA_CONFIG, ...overrides });
}

/** Create a real EventEmitter instance */
export function createEventEmitter(): InvarianceEventEmitter {
  return new InvarianceEventEmitter();
}

/** Create a real Telemetry instance (enabled by default) */
export function createTelemetry(enabled = true): Telemetry {
  return new Telemetry(enabled);
}
