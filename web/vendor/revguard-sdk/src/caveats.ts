import { encodeAbiParameters, encodePacked, type Address, type Hex } from "viem";
import { FRAMEWORK } from "./addresses.js";

/**
 * Caveat term/arg encoders. These MUST stay byte-for-byte identical to the on-chain decoders:
 *   - TimestampEnforcer.getTermsInfo      (src in delegation-framework)
 *   - NonceEnforcer.getTermsInfo
 *   - HeartbeatEnforcer.getTermsInfo / HeartbeatLib  (src/libraries/HeartbeatLib.sol)
 */

export interface Caveat {
  enforcer: Address;
  terms: Hex;
  args: Hex;
}

/** TimestampEnforcer terms: bytes16(after) ++ bytes16(before) = one 32-byte word. */
export function timestampCaveat(notAfterUnix: bigint, notBeforeUnix = 0n): Caveat {
  const terms = encodePacked(["uint128", "uint128"], [notBeforeUnix, notAfterUnix]);
  return { enforcer: FRAMEWORK.timestampEnforcer, terms, args: "0x" };
}

/** NonceEnforcer terms: a single uint256 nonce (the delegator's current nonce at signing time). */
export function nonceCaveat(stampedNonce: bigint): Caveat {
  const terms = encodeAbiParameters([{ type: "uint256" }], [stampedNonce]);
  return { enforcer: FRAMEWORK.nonceEnforcer, terms, args: "0x" };
}

/** HeartbeatEnforcer terms: a single uint256 TTL (seconds). `args` is attached at redemption. */
export function heartbeatCaveat(heartbeatEnforcer: Address, ttlSeconds: bigint): Caveat {
  const terms = encodeAbiParameters([{ type: "uint256" }], [ttlSeconds]);
  return { enforcer: heartbeatEnforcer, terms, args: "0x" };
}

/** HeartbeatEnforcer args (the freshness proof supplied by the redeemer): (uint64 issuedAt, bytes signature). */
export function heartbeatArgs(issuedAt: bigint, signature: Hex): Hex {
  return encodeAbiParameters([{ type: "uint64" }, { type: "bytes" }], [issuedAt, signature]);
}
