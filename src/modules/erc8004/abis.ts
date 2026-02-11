/**
 * Minimal viem-compatible ABIs for the three ERC-8004 registry contracts.
 *
 * Only includes functions that the SDK calls. Sourced from the
 * ERC-8004 reference implementation.
 */

/** ABI for the ERC-8004 Identity Registry */
export const ERC8004IdentityRegistryAbi = [
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'agentURI', type: 'string', internalType: 'string' },
    ],
    outputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMetadata',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'key', type: 'string', internalType: 'string' },
    ],
    outputs: [
      { name: 'value', type: 'string', internalType: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setMetadata',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'key', type: 'string', internalType: 'string' },
      { name: 'value', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAgentWallet',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'newWallet', type: 'address', internalType: 'address' },
      { name: 'deadline', type: 'uint256', internalType: 'uint256' },
      { name: 'signature', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAgentWallet',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: 'wallet', type: 'address', internalType: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setAgentURI',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'agentURI', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'agentURI',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'string', internalType: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
      { name: 'agentURI', type: 'string', indexed: false, internalType: 'string' },
    ],
  },
] as const;

/** ABI for the ERC-8004 Reputation Registry */
export const ERC8004ReputationRegistryAbi = [
  {
    type: 'function',
    name: 'giveFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'value', type: 'uint8', internalType: 'uint8' },
      { name: 'tag1', type: 'string', internalType: 'string' },
      { name: 'tag2', type: 'string', internalType: 'string' },
      { name: 'feedbackURI', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revokeFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'feedbackIndex', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getSummary',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: 'count', type: 'uint256', internalType: 'uint256' },
      { name: 'summaryValue', type: 'uint256', internalType: 'uint256' },
      { name: 'decimals', type: 'uint8', internalType: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'readFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'client', type: 'address', internalType: 'address' },
      { name: 'index', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: 'value', type: 'uint8', internalType: 'uint8' },
      { name: 'tag1', type: 'string', internalType: 'string' },
      { name: 'tag2', type: 'string', internalType: 'string' },
      { name: 'feedbackURI', type: 'string', internalType: 'string' },
      { name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'readAllFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        internalType: 'struct IReputationRegistry.Feedback[]',
        components: [
          { name: 'client', type: 'address', internalType: 'address' },
          { name: 'value', type: 'uint8', internalType: 'uint8' },
          { name: 'tag1', type: 'string', internalType: 'string' },
          { name: 'tag2', type: 'string', internalType: 'string' },
          { name: 'feedbackURI', type: 'string', internalType: 'string' },
          { name: 'timestamp', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getClients',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'address[]', internalType: 'address[]' },
    ],
    stateMutability: 'view',
  },
] as const;

/** ABI for the ERC-8004 Validation Registry */
export const ERC8004ValidationRegistryAbi = [
  {
    type: 'function',
    name: 'validationRequest',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'validator', type: 'address', internalType: 'address' },
      { name: 'requestURI', type: 'string', internalType: 'string' },
    ],
    outputs: [
      { name: 'requestHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'validationResponse',
    inputs: [
      { name: 'requestHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'response', type: 'uint8', internalType: 'uint8' },
      { name: 'responseURI', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getValidationStatus',
    inputs: [
      { name: 'requestHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'validator', type: 'address', internalType: 'address' },
      { name: 'requestURI', type: 'string', internalType: 'string' },
      { name: 'response', type: 'uint8', internalType: 'uint8' },
      { name: 'responseURI', type: 'string', internalType: 'string' },
      { name: 'completed', type: 'bool', internalType: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSummary',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: 'count', type: 'uint256', internalType: 'uint256' },
      { name: 'avgResponse', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentValidations',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'bytes32[]', internalType: 'bytes32[]' },
    ],
    stateMutability: 'view',
  },
] as const;
