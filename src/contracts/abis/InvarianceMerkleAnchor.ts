export const InvarianceMerkleAnchorAbi = [
  {
    type: 'function',
    name: 'anchor',
    inputs: [
      { name: 'root', type: 'bytes32' },
      { name: 'leafCount', type: 'uint256' },
    ],
    outputs: [{ name: 'batchId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'verify',
    inputs: [
      { name: 'batchId', type: 'uint256' },
      { name: 'leaf', type: 'bytes32' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAnchor',
    inputs: [{ name: 'batchId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'root', type: 'bytes32' },
          { name: 'leafCount', type: 'uint256' },
          { name: 'timestamp', type: 'uint64' },
          { name: 'anchoredBy', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBatchCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'Anchored',
    inputs: [
      { name: 'batchId', type: 'uint256', indexed: true },
      { name: 'root', type: 'bytes32', indexed: true },
      { name: 'leafCount', type: 'uint256', indexed: false },
      { name: 'anchoredBy', type: 'address', indexed: true },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ],
  },
] as const;
