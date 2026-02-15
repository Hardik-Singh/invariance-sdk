export const InvarianceAtomicVerifierAbi = [
  {
    type: 'function',
    name: 'verifyAndLog',
    inputs: [
      {
        name: 'input',
        type: 'tuple',
        components: [
          { name: 'actorIdentityId', type: 'bytes32' },
          { name: 'actorAddress', type: 'address' },
          { name: 'action', type: 'string' },
          { name: 'category', type: 'string' },
          { name: 'metadataHash', type: 'bytes32' },
          { name: 'proofHash', type: 'bytes32' },
          { name: 'severity', type: 'uint8' },
        ],
      },
      { name: 'actorSig', type: 'bytes' },
      { name: 'platformSig', type: 'bytes' },
    ],
    outputs: [{ name: 'entryId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'AtomicVerification',
    inputs: [
      { name: 'entryId', type: 'bytes32', indexed: true },
      { name: 'actorIdentityId', type: 'bytes32', indexed: true },
      { name: 'actorAddress', type: 'address', indexed: true },
      { name: 'action', type: 'string', indexed: false },
    ],
  },
] as const;
