/** Minimal ABI fragments for the contracts RevGuard interacts with. */

const DELEGATION_COMPONENTS = [
  { name: "delegate", type: "address" },
  { name: "delegator", type: "address" },
  { name: "authority", type: "bytes32" },
  {
    name: "caveats",
    type: "tuple[]",
    components: [
      { name: "enforcer", type: "address" },
      { name: "terms", type: "bytes" },
      { name: "args", type: "bytes" },
    ],
  },
  { name: "salt", type: "uint256" },
  { name: "signature", type: "bytes" },
] as const;

/** The Delegation tuple type, for abi-encoding permission contexts and getDelegationHash. */
export const DELEGATION_TUPLE = { type: "tuple", components: DELEGATION_COMPONENTS } as const;
export const DELEGATION_ARRAY = { type: "tuple[]", components: DELEGATION_COMPONENTS } as const;

export const MANAGER_ABI = [
  {
    type: "function",
    name: "redeemDelegations",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_permissionContexts", type: "bytes[]" },
      { name: "_modes", type: "bytes32[]" },
      { name: "_executionCallDatas", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getDelegationHash",
    stateMutability: "pure",
    inputs: [{ name: "_delegation", ...DELEGATION_TUPLE }],
    outputs: [{ type: "bytes32" }],
  },
  { type: "function", name: "getDomainHash", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function",
    name: "disableDelegation",
    stateMutability: "nonpayable",
    inputs: [{ name: "_delegation", ...DELEGATION_TUPLE }],
    outputs: [],
  },
] as const;

export const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "incrementNonce",
    stateMutability: "nonpayable",
    inputs: [{ name: "_delegationManager", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "_delegationManager", type: "address" },
      { name: "_delegator", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const HEARTBEAT_ENFORCER_ABI = [
  {
    type: "function",
    name: "setSigner",
    stateMutability: "nonpayable",
    inputs: [{ name: "_signer", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "signerOf",
    stateMutability: "view",
    inputs: [{ name: "delegator", type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const LENS_ABI = [
  {
    type: "function",
    name: "windowBound",
    stateMutability: "view",
    inputs: [
      { name: "_notAfter", type: "uint256" },
      { name: "_heartbeatTtl", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "previewChain",
    stateMutability: "view",
    inputs: [
      { name: "_chain", ...DELEGATION_ARRAY },
      { name: "_heartbeatIssuedAt", type: "uint64[]" },
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "failingIndex", type: "uint256" },
      { name: "reason", type: "string" },
    ],
  },
] as const;

export const COUNTER_ABI = [
  { type: "function", name: "increment", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/** RevGuardAccount (the demo root smart account) — ERC-7579 executor entrypoint. */
export const ACCOUNT_ABI = [
  {
    type: "function",
    name: "executeFromExecutor",
    stateMutability: "payable",
    inputs: [
      { name: "_mode", type: "bytes32" },
      { name: "_executionCalldata", type: "bytes" },
    ],
    outputs: [{ name: "returnData", type: "bytes[]" }],
  },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
