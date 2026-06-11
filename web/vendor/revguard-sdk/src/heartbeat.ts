import type { Account, Address, Hex } from "viem";

/**
 * RevGuard layer (c): off-chain EIP-712 heartbeat freshness proofs.
 *
 * The heartbeat service signs short-TTL `Heartbeat(delegator, issuedAt)` messages on a cadence. An agent
 * attaches the freshest proof it holds as the HeartbeatEnforcer caveat's `args` at redemption. To revoke,
 * the service simply STOPS signing — the last proof ages past the TTL and every redemption then reverts.
 *
 * The domain matches `HeartbeatEnforcer` (OpenZeppelin EIP712: name "RevGuardHeartbeat", version "1").
 */

export const HEARTBEAT_TYPES = {
  Heartbeat: [
    { name: "delegator", type: "address" },
    { name: "issuedAt", type: "uint64" },
  ],
} as const;

export function heartbeatDomain(chainId: number, heartbeatEnforcer: Address) {
  return {
    name: "RevGuardHeartbeat",
    version: "1",
    chainId,
    verifyingContract: heartbeatEnforcer,
  } as const;
}

export interface SignedHeartbeat {
  delegator: Address;
  issuedAt: bigint;
  signature: Hex;
}

/** Sign one heartbeat for `delegator` at `issuedAt` (unix seconds). */
export async function signHeartbeat(
  signer: Account,
  chainId: number,
  heartbeatEnforcer: Address,
  delegator: Address,
  issuedAt: bigint,
): Promise<SignedHeartbeat> {
  if (!signer.signTypedData) throw new Error("signer account cannot signTypedData");
  const signature = await signer.signTypedData({
    domain: heartbeatDomain(chainId, heartbeatEnforcer),
    types: HEARTBEAT_TYPES,
    primaryType: "Heartbeat",
    message: { delegator, issuedAt },
  });
  return { delegator, issuedAt, signature };
}

/**
 * A minimal off-chain heartbeat service: keeps the freshest signed proof per delegator and re-signs on a
 * cadence. Calling `revoke(delegator)` (or `stop()`) is the passive revocation channel of layer (c).
 */
export class HeartbeatService {
  private latestProof = new Map<Address, SignedHeartbeat>();
  private timers = new Map<Address, ReturnType<typeof setInterval>>();

  constructor(
    private readonly signer: Account,
    private readonly chainId: number,
    private readonly heartbeatEnforcer: Address,
    private readonly cadenceMs = 5_000,
    private readonly now: () => bigint = () => BigInt(Math.floor(Date.now() / 1000)),
  ) {}

  /** Begin signing heartbeats for `delegator`; immediately produces a fresh proof. */
  async start(delegator: Address): Promise<void> {
    await this.beat(delegator);
    const timer = setInterval(() => void this.beat(delegator), this.cadenceMs);
    this.timers.set(delegator, timer);
  }

  private async beat(delegator: Address): Promise<void> {
    this.latestProof.set(
      delegator,
      await signHeartbeat(this.signer, this.chainId, this.heartbeatEnforcer, delegator, this.now()),
    );
  }

  /** The freshest proof the agent can attach at redemption, or undefined if revoked / never started. */
  latest(delegator: Address): SignedHeartbeat | undefined {
    return this.latestProof.get(delegator);
  }

  /** Revoke by silence: stop signing and drop the stored proof so it ages out. */
  revoke(delegator: Address): void {
    const timer = this.timers.get(delegator);
    if (timer) clearInterval(timer);
    this.timers.delete(delegator);
    this.latestProof.delete(delegator);
  }

  /** Stop the whole service. */
  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.latestProof.clear();
  }
}
