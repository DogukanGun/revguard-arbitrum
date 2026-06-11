import {
  encodeFunctionData,
  encodePacked,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  ACCOUNT_ABI,
  COUNTER_ABI,
  HEARTBEAT_ENFORCER_ABI,
  LENS_ABI,
  MANAGER_ABI,
  NONCE_ENFORCER_ABI,
} from "./abis.js";
import { encodePermissionContext, type Delegation } from "./delegation.js";
import { heartbeatArgs } from "./caveats.js";
import type { SignedHeartbeat } from "./heartbeat.js";

/** ERC-7579 "simple single" execution mode (CALLTYPE_SINGLE + EXECTYPE_DEFAULT) == bytes32(0). */
export const SINGLE_MODE = `0x${"00".repeat(32)}` as Hex;

/** ERC-7579 single execution calldata: target ++ value ++ callData. */
export function encodeSingleExecution(target: Address, value: bigint, callData: Hex): Hex {
  return encodePacked(["address", "uint256", "bytes"], [target, value, callData]);
}

/** Attach a fresh heartbeat proof to the root delegation's heartbeat caveat (the last caveat on the root link). */
export function attachHeartbeat(chain: Delegation[], proof: SignedHeartbeat): void {
  const root = chain[chain.length - 1];
  const hbIndex = root.caveats.length - 1; // heartbeat is the last RevGuard caveat
  root.caveats[hbIndex] = { ...root.caveats[hbIndex], args: heartbeatArgs(proof.issuedAt, proof.signature) };
}

/** Redeem a leaf→root chain, executing a single call (default: increment a demo Counter). */
export async function redeem(
  wallet: WalletClient,
  agent: Account,
  manager: Address,
  chain: Delegation[],
  execution: Hex,
): Promise<Hex> {
  return wallet.writeContract({
    account: agent,
    chain: null,
    address: manager,
    abi: MANAGER_ABI,
    functionName: "redeemDelegations",
    args: [[encodePermissionContext(chain)], [SINGLE_MODE], [execution]],
  });
}

/** Revoke ALL of a delegator's outstanding delegations in one tx (layer b). */
export async function revokeAll(
  wallet: WalletClient,
  delegator: Account,
  nonceEnforcer: Address,
  manager: Address,
): Promise<Hex> {
  return wallet.writeContract({
    account: delegator,
    chain: null,
    address: nonceEnforcer,
    abi: NONCE_ENFORCER_ABI,
    functionName: "incrementNonce",
    args: [manager],
  });
}

/** Register the heartbeat signer for a delegator (called directly by the delegator EOA). */
export async function registerHeartbeatSigner(
  wallet: WalletClient,
  delegator: Account,
  heartbeatEnforcer: Address,
  signer: Address,
): Promise<Hex> {
  return wallet.writeContract({
    account: delegator,
    chain: null,
    address: heartbeatEnforcer,
    abi: HEARTBEAT_ENFORCER_ABI,
    functionName: "setSigner",
    args: [signer],
  });
}

// --- admin routing through the root smart account ---------------------------------------------------
// When the delegator is a smart account (RevGuardAccount), admin actions keyed to msg.sender==delegator
// must be invoked *by the account*. The account's `executeFromExecutor` performs an inner call, so any
// funded caller (e.g. the connected wallet) can route setSigner / incrementNonce / disableDelegation
// through the account in a single tx.

function executeFromExecutor(
  wallet: WalletClient,
  sender: Account,
  root: Address,
  target: Address,
  innerCalldata: Hex,
): Promise<Hex> {
  return wallet.writeContract({
    account: sender,
    chain: null,
    address: root,
    abi: ACCOUNT_ABI,
    functionName: "executeFromExecutor",
    args: [SINGLE_MODE, encodeSingleExecution(target, 0n, innerCalldata)],
  });
}

/** Register the heartbeat signer for a smart-account delegator, routed via the account. */
export async function registerSignerViaAccount(
  wallet: WalletClient,
  sender: Account,
  root: Address,
  heartbeatEnforcer: Address,
  signer: Address,
): Promise<Hex> {
  const inner = encodeFunctionData({ abi: HEARTBEAT_ENFORCER_ABI, functionName: "setSigner", args: [signer] });
  return executeFromExecutor(wallet, sender, root, heartbeatEnforcer, inner);
}

/** Bulk-revoke all of the smart-account delegator's delegations (incrementNonce), routed via the account. */
export async function revokeViaAccount(
  wallet: WalletClient,
  sender: Account,
  root: Address,
  nonceEnforcer: Address,
  manager: Address,
): Promise<Hex> {
  const inner = encodeFunctionData({ abi: NONCE_ENFORCER_ABI, functionName: "incrementNonce", args: [manager] });
  return executeFromExecutor(wallet, sender, root, nonceEnforcer, inner);
}

/** Disable a single delegation whose delegator is the smart account, routed via the account. */
export async function disableViaAccount(
  wallet: WalletClient,
  sender: Account,
  root: Address,
  manager: Address,
  delegation: Delegation,
): Promise<Hex> {
  const inner = encodeFunctionData({
    abi: MANAGER_ABI,
    functionName: "disableDelegation",
    args: [delegation as never],
  });
  return executeFromExecutor(wallet, sender, root, manager, inner);
}

/** The deterministic revocation window (seconds): min(remaining hard TTL, heartbeat TTL). */
export async function windowBound(
  publicClient: PublicClient,
  lens: Address,
  notAfter: bigint,
  heartbeatTtl: bigint,
): Promise<bigint> {
  return publicClient.readContract({
    address: lens,
    abi: LENS_ABI,
    functionName: "windowBound",
    args: [notAfter, heartbeatTtl],
  }) as Promise<bigint>;
}

/** Preview why a chain would (not) redeem — mirrors the Python Decision (first failing link + reason). */
export async function previewChain(
  publicClient: PublicClient,
  lens: Address,
  chain: Delegation[],
  heartbeatIssuedAt: bigint[],
): Promise<{ ok: boolean; failingIndex: bigint; reason: string }> {
  const [ok, failingIndex, reason] = (await publicClient.readContract({
    address: lens,
    abi: LENS_ABI,
    functionName: "previewChain",
    args: [chain, heartbeatIssuedAt],
  })) as [boolean, bigint, string];
  return { ok, failingIndex, reason };
}

export async function counterValue(publicClient: PublicClient, counter: Address): Promise<bigint> {
  return publicClient.readContract({ address: counter, abi: COUNTER_ABI, functionName: "count" }) as Promise<bigint>;
}

/** The delegator's current nonce in the NonceEnforcer (a redemption needs the stamped nonce to match). */
export async function currentNonce(
  publicClient: PublicClient,
  nonceEnforcer: Address,
  manager: Address,
  delegator: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: nonceEnforcer,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [manager, delegator],
  }) as Promise<bigint>;
}

/** The heartbeat signer registered for a delegator (zero address if none). */
export async function heartbeatSignerOf(
  publicClient: PublicClient,
  heartbeatEnforcer: Address,
  delegator: Address,
): Promise<Address> {
  return publicClient.readContract({
    address: heartbeatEnforcer,
    abi: HEARTBEAT_ENFORCER_ABI,
    functionName: "signerOf",
    args: [delegator],
  }) as Promise<Address>;
}

export function incrementCalldata(): Hex {
  // selector for increment()
  return "0xd09de08a";
}
