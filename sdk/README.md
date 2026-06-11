# @revguard/sdk

TypeScript + viem SDK for RevGuard — bounded revocation for ERC‑7710 agent delegation chains.

```bash
npm install
npm run typecheck
npm run demo          # illustrative; see note below
```

## What's here

| Module | Purpose |
|---|---|
| `addresses.ts` | canonical framework addresses, Arbitrum Sepolia config, `RevGuardDeployment` type |
| `caveats.ts` | byte‑for‑byte encoders for Timestamp / Nonce / Heartbeat caveat terms + heartbeat args |
| `heartbeat.ts` | EIP‑712 heartbeat signing + `HeartbeatService` (the layer‑(c) off‑chain signer; `revoke()` = stop) |
| `delegation.ts` | EIP‑712 delegation types + `buildSignedChain` (returns a signed leaf→root chain) |
| `client.ts` | `redeem`, `revokeAll`, `registerHeartbeatSigner`, `windowBound`, `previewChain` |

## Typical flow

```ts
import { buildSignedChain, HeartbeatService, attachHeartbeat, redeem, revokeAll,
         timestampCaveat, nonceCaveat, heartbeatCaveat } from "@revguard/sdk";

// 1. caveats on the root link
const rootCaveats = [timestampCaveat(now + 3600n), nonceCaveat(currentNonce),
                     heartbeatCaveat(deployment.heartbeatEnforcer, 39n)];

// 2. build + sign the chain (root smart account -> hops -> agent)
const chain = await buildSignedChain(publicClient, manager, chainId, { rootAccount, rootOwner, hops, agent, rootCaveats });

// 3. run the heartbeat service; agent attaches the freshest proof and redeems
const hb = new HeartbeatService(signer, chainId, deployment.heartbeatEnforcer);
await hb.start(rootAccount);
attachHeartbeat(chain, hb.latest(rootAccount)!);
await redeem(wallet, agent, manager, chain, execution);

// 4. revoke — one tx, or just stop signing heartbeats
await revokeAll(wallet, rootOwner, deployment.nonceEnforcer, manager);  // OR  hb.revoke(rootAccount)
```

The encoders here mirror `src/libraries/HeartbeatLib.sol` and the framework enforcers exactly. The
reliable end‑to‑end demo is the Foundry script `../script/DemoOnChain.s.sol`; `src/demo.ts` illustrates
the read/build/sign API surface and needs a deployment + node to run fully.
