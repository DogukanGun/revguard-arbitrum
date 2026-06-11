import {
  encodeAbiParameters,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { DELEGATION_ARRAY, DELEGATION_TUPLE, MANAGER_ABI } from "./abis.js";
import type { Caveat } from "./caveats.js";
import { ROOT_AUTHORITY } from "./addresses.js";

/**
 * EIP-712 typed-data definition for a MetaMask delegation. `args` and `signature` are intentionally
 * excluded from the hash (the framework allows them to be set post-signing), matching DELEGATION_TYPEHASH.
 */
export const DELEGATION_TYPES = {
  Delegation: [
    { name: "delegate", type: "address" },
    { name: "delegator", type: "address" },
    { name: "authority", type: "bytes32" },
    { name: "caveats", type: "Caveat[]" },
    { name: "salt", type: "uint256" },
  ],
  Caveat: [
    { name: "enforcer", type: "address" },
    { name: "terms", type: "bytes" },
  ],
} as const;

export interface Delegation {
  delegate: Address;
  delegator: Address;
  authority: Hex;
  caveats: Caveat[];
  salt: bigint;
  signature: Hex;
}

function delegationDomain(chainId: number, manager: Address) {
  return { name: "DelegationManager", version: "1", chainId, verifyingContract: manager } as const;
}

/** Sign a single delegation with the delegator's key (EOA) or the root account owner's key (ERC-1271). */
async function signDelegation(
  signer: Account,
  chainId: number,
  manager: Address,
  d: Delegation,
): Promise<Hex> {
  if (!signer.signTypedData) throw new Error("signer cannot signTypedData");
  return signer.signTypedData({
    domain: delegationDomain(chainId, manager),
    types: DELEGATION_TYPES,
    primaryType: "Delegation",
    message: {
      delegate: d.delegate,
      delegator: d.delegator,
      authority: d.authority,
      caveats: d.caveats.map((c) => ({ enforcer: c.enforcer, terms: c.terms })),
      salt: d.salt,
    },
  });
}

export interface ChainSpec {
  /** Root smart-account address (the original authority holder). */
  rootAccount: Address;
  /** Account that owns the root smart account (its signatures are accepted via ERC-1271). */
  rootOwner: Account;
  /** Intermediate EOA delegators in root→leaf order (empty for a depth-1 chain). */
  hops: Account[];
  /** The leaf delegate (the autonomous agent that redeems). */
  agent: Address;
  /** Caveats attached to the ROOT delegation (typically the three RevGuard caveats). */
  rootCaveats: Caveat[];
}

/**
 * Build a fully-signed delegation chain, returned in **leaf→root** order as `redeemDelegations` expects.
 * Each child's `authority` is its parent's delegation hash, fetched from the on-chain (pure)
 * `getDelegationHash` so the bytes match the manager exactly.
 */
export async function buildSignedChain(
  publicClient: PublicClient,
  manager: Address,
  chainId: number,
  spec: ChainSpec,
): Promise<Delegation[]> {
  const delegators: Address[] = [spec.rootAccount, ...spec.hops.map((h) => h.address)];
  const signers: Account[] = [spec.rootOwner, ...spec.hops];
  const depth = delegators.length;

  const rootToLeaf: Delegation[] = [];
  let authority: Hex = ROOT_AUTHORITY;

  for (let i = 0; i < depth; i++) {
    const delegate = i + 1 < depth ? delegators[i + 1] : spec.agent;
    const d: Delegation = {
      delegate,
      delegator: delegators[i],
      authority,
      caveats: i === 0 ? spec.rootCaveats : [],
      salt: 0n,
      signature: "0x",
    };
    d.signature = await signDelegation(signers[i], chainId, manager, d);
    rootToLeaf.push(d);

    authority = (await publicClient.readContract({
      address: manager,
      abi: MANAGER_ABI,
      functionName: "getDelegationHash",
      args: [d],
    })) as Hex;
  }

  return rootToLeaf.reverse(); // leaf→root
}

/** ABI-encode a leaf→root chain as a `redeemDelegations` permission context. */
export function encodePermissionContext(chain: Delegation[]): Hex {
  // viem's tuple typing can't infer our struct shape from the const ABI param; the runtime shape matches.
  return encodeAbiParameters([DELEGATION_ARRAY], [chain] as never);
}

export { DELEGATION_TUPLE };
