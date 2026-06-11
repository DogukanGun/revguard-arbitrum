# RevGuard Dashboard

A live Next.js dashboard for **RevGuard** on Arbitrum Sepolia. Build a multi-hop ERC-7710 agent chain,
redeem it, then revoke and watch the window close and the agent go **BLOCKED** — deterministically and
depth-independently. Every action is a real on-chain transaction against the deployed contracts.

Stack: Next.js 15 (App Router) · Tailwind v4 · framer-motion · wagmi + viem · `@revguard/sdk` (local).

## Prereqs

1. Deploy RevGuard + demo fixtures to Arbitrum Sepolia (from the repo root):
   ```bash
   forge script script/DeployRevGuard.s.sol --rpc-url $ARB_SEPOLIA_RPC --broadcast \
     --verify --verifier etherscan --etherscan-api-key $ARBISCAN_KEY
   ```
   This deploys `HeartbeatEnforcer`, `RevGuardLens`, a demo `RevGuardAccount` root, and a `Counter`,
   and writes `deployments/421614.json`.
2. Point the dashboard at it:
   ```bash
   cp ../deployments/421614.json lib/deployment.json
   ```
   (The framework addresses are already filled in; this fills the four RevGuard-authored ones.)
3. A browser wallet (MetaMask) on **Arbitrum Sepolia (421614)** funded with a little testnet ETH — it is
   the *only* funded actor and pays gas for redeem + revoke.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

Optional: `NEXT_PUBLIC_RPC_URL` overrides the default public Arbitrum Sepolia RPC.

## Demo flow (the video)

1. **Connect** your wallet (Arbitrum Sepolia).
2. **Initialize demo chain** — builds + signs `root → hop1 → hop2 → you` in-browser and registers the
   heartbeat signer (one tx). The chain graph lights up; heartbeats start flowing.
3. **Redeem (agent acts)** — a real `redeemDelegations`; the Counter increments; the agent badge is ACTING.
4. **Revoke** — either **bumpNonce** (one on-chain tx) or **silence** (stop the heartbeat, no tx). The
   window ring starts closing.
5. The agent is **BLOCKED** within the bound — the race timeline shows `enforced in Xs ≤ 39s bound`,
   the layer that fired is highlighted, and the Counter stays put.

## How the single-funded-wallet demo works

The root is a smart account (execution runs on it), and `setSigner`/`incrementNonce` are keyed to
`msg.sender == delegator`. So the connected wallet routes those admin actions **through** the demo root
account (`executeFromExecutor`) and is the only account that ever sends a transaction. The hops and the
heartbeat signer are deterministic, testnet-only demo keys (`lib/demoActors.ts`) used purely for
off-chain signing — they hold no value and match the on-chain demo root's owner.

The dashboard never deploys anything; it reads live state from `RevGuardLens` (`previewChain`,
`windowBound`) and the enforcers, and reuses `@revguard/sdk` for all encoding/signing/submitting.
