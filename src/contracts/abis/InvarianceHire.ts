export const InvarianceHireAbi = [
  {
    "type": "function",
    "name": "create",
    "inputs": [
      { "name": "listingId", "type": "bytes32", "internalType": "bytes32" },
      { "name": "escrowId", "type": "bytes32", "internalType": "bytes32" },
      { "name": "policyId", "type": "bytes32", "internalType": "bytes32" },
      { "name": "provider", "type": "address", "internalType": "address" },
      { "name": "taskDescription", "type": "string", "internalType": "string" }
    ],
    "outputs": [
      { "name": "hireId", "type": "bytes32", "internalType": "bytes32" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "complete",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancel",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "dispute",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getHire",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IInvarianceHire.Hire",
        "components": [
          { "name": "hireId", "type": "bytes32", "internalType": "bytes32" },
          { "name": "listingId", "type": "bytes32", "internalType": "bytes32" },
          { "name": "escrowId", "type": "bytes32", "internalType": "bytes32" },
          { "name": "policyId", "type": "bytes32", "internalType": "bytes32" },
          { "name": "hirer", "type": "address", "internalType": "address" },
          { "name": "provider", "type": "address", "internalType": "address" },
          { "name": "taskDescription", "type": "string", "internalType": "string" },
          { "name": "status", "type": "uint8", "internalType": "enum IInvarianceHire.HireStatus" },
          { "name": "createdAt", "type": "uint256", "internalType": "uint256" },
          { "name": "completedAt", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getHiresByHirer",
    "inputs": [
      { "name": "hirer", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "", "type": "bytes32[]", "internalType": "bytes32[]" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getHiresByProvider",
    "inputs": [
      { "name": "provider", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "", "type": "bytes32[]", "internalType": "bytes32[]" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hireCount",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "HireCreated",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "listingId", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "hirer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "provider", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "escrowId", "type": "bytes32", "indexed": false, "internalType": "bytes32" },
      { "name": "policyId", "type": "bytes32", "indexed": false, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HireCompleted",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "hirer", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HireCancelled",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "hirer", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HireDisputed",
    "inputs": [
      { "name": "hireId", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "disputant", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  }
] as const;
