import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Embedded demo actors. Derived deterministically from fixed labels so they match the on-chain
 * `RevGuardAccount` owner deployed by `DeployRevGuard.demoOwner()` (= keccak256("revguard.demo.rootOwner")).
 *
 * TESTNET-ONLY. These keys hold no value and are used purely for OFF-CHAIN signing (delegations +
 * heartbeats). None of them ever sends a transaction — the connected wallet is the only funded actor.
 */
function demoKey(label: string): Hex {
  return keccak256(toBytes(label));
}

/** Owner of the on-chain demo `RevGuardAccount` (signs the root delegation via ERC-1271). */
export const rootOwner = privateKeyToAccount(demoKey("revguard.demo.rootOwner"));

/** Intermediate EOA delegators (sign their links off-chain only). */
export const hop1 = privateKeyToAccount(demoKey("revguard.demo.hop1"));
export const hop2 = privateKeyToAccount(demoKey("revguard.demo.hop2"));

/** The heartbeat signer (signs EIP-712 freshness proofs in-browser). */
export const hbSigner = privateKeyToAccount(demoKey("revguard.demo.hbSigner"));
