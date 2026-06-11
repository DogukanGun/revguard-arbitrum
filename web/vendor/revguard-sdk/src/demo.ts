/**
 * RevGuard SDK demo (illustrative).
 *
 * Shows the developer flow: register a heartbeat signer, build a signed ERC-7710 chain with the three
 * RevGuard caveats, run the off-chain heartbeat service, and preview the chain through RevGuardLens.
 *
 * Prereqs for a full run: a node (anvil fork of Arbitrum Sepolia or live), a RevGuard deployment
 * (`forge script DeployRevGuard`), and a deployed RevGuardAccount + Counter. Read-only steps work
 * against any node where the lens + enforcers exist. The reliable end-to-end demo is the Foundry
 * script `script/DemoOnChain.s.sol` — this file demonstrates the TypeScript API surface.
 */
import { createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

import { ARBITRUM_SEPOLIA, type RevGuardDeployment } from "./addresses.js";
import { heartbeatCaveat, nonceCaveat, timestampCaveat } from "./caveats.js";
import { HeartbeatService } from "./heartbeat.js";
import { buildSignedChain } from "./delegation.js";
import { previewChain, windowBound } from "./client.js";

const RPC = process.env.RPC_URL ?? ARBITRUM_SEPOLIA.rpc;
const HARD_TTL = 3600n;
const HB_TTL = 39n;

async function main() {
  const deployment: RevGuardDeployment = JSON.parse(
    readFileSync(new URL("../../deployments/421614.json", import.meta.url), "utf8"),
  );

  const publicClient = createPublicClient({ transport: http(RPC) });
  const chainId = await publicClient.getChainId();

  // Demo actors (test keys only).
  const rootOwner = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const agent = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const hbSigner = privateKeyToAccount(`0x${"33".repeat(32)}`);
  const rootAccount = rootOwner.address as Address; // a real run deploys a RevGuardAccount here

  const now = BigInt(Math.floor(Date.now() / 1000));
  const rootCaveats = [
    timestampCaveat(now + HARD_TTL),
    nonceCaveat(0n),
    heartbeatCaveat(deployment.heartbeatEnforcer, HB_TTL),
  ];

  const chain = await buildSignedChain(publicClient, deployment.delegationManager, chainId, {
    rootAccount,
    rootOwner,
    hops: [],
    agent: agent.address,
    rootCaveats,
  });
  console.log(`Built signed depth-${chain.length} chain. leaf delegate = ${agent.address}`);

  // Off-chain heartbeat service (layer c).
  const service = new HeartbeatService(hbSigner, chainId, deployment.heartbeatEnforcer);
  await service.start(rootAccount);
  console.log("Heartbeat service running; latest proof issuedAt =", service.latest(rootAccount)?.issuedAt);

  const bound = await windowBound(publicClient, deployment.revGuardLens, now + HARD_TTL, HB_TTL);
  console.log(`Deterministic revocation bound = ${bound}s`);

  const preview = await previewChain(publicClient, deployment.revGuardLens, chain, [now]);
  console.log("Lens preview:", preview);

  // Revoke by silence:
  service.revoke(rootAccount);
  console.log("Heartbeat service revoked (silent); proof now:", service.latest(rootAccount));
  service.stop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
