/**
 * Step 2: Register a Trading Agent Identity
 *
 * Every actor in Invariance must have a registered identity. This creates
 * an on-chain record linking the agent address to its owner and capabilities.
 */

import type { Invariance, Identity } from '@invariance/sdk';
import { log } from '../utils/logger.js';

export async function registerAgent(
  inv: Invariance,
  ownerAddress: string,
): Promise<Identity> {
  log.step(2, 'Register Agent Identity');

  log.info('Registering "TradingBot" as a verified agent...');

  const identity = await inv.identity.register({
    type: 'agent',
    owner: ownerAddress,
    label: 'TradingBot',
    capabilities: ['swap', 'rebalance'],
    metadata: {
      version: '1.0.0',
      runtime: 'node',
    },
  });

  log.success('Agent identity registered on-chain');
  log.data('Identity ID', identity.identityId);
  log.data('Address', identity.address);
  log.data('Owner', identity.owner);
  log.data('Label', identity.label);
  log.data('Capabilities', identity.capabilities.join(', '));
  log.data('Status', identity.status);
  log.data('Tx hash', identity.txHash);
  log.data('Explorer', identity.explorerUrl);

  return identity;
}
