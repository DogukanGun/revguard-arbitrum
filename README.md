# RevGuard — Bounded Revocation for Autonomous Agent Delegation Chains

**Track:** Best Agentic Project · **Chain:** Arbitrum (Sepolia / One) · **Built on:** MetaMask Delegation Framework (ERC‑7710 / ERC‑7715)

> An autonomous agent that holds redelegated on‑chain authority can keep acting after you try to
> revoke it. ERC‑7710 lets authority flow `root → A → B → C`, but says **nothing** about how fast a
> revocation reaches every downstream link — and a compromised middle hop can simply refuse to pass it
> on. RevGuard makes revocation **deterministically bounded**: once you revoke, the whole subtree stops
> within a provable, measurable window — `min(remaining TTL, heartbeat TTL, on‑chain disable latency)` —
> **independent of how deep the chain is**, and **without trusting any downstream link**.

---

## The problem (and why it matters now)

Agentic wallets are shipping. With ERC‑7710 redelegation an AI agent can sub‑delegate scoped spending
authority to other agents/services, several hops deep. The missing safety primitive is **revocation
latency**: the interval between "user clicks revoke" and "the last honest enforcer stops honoring it."
Today that interval is unbounded, and a withholding intermediary can make authority effectively
immortal. For money‑moving agents that is the difference between a contained incident and a drained
account.

## What RevGuard does

RevGuard composes **three revocation layers**, each of which caps the window on its own — no layer needs
cooperation from any downstream link:

| Layer | Mechanism | Provided by |
|---|---|---|
| **(a) Full‑chain re‑validation** | every redemption re‑checks every ancestor; disabling any ancestor atomically collapses the whole subtree, `O(1)`, depth‑independent | **reused**: deployed `DelegationManager.redeemDelegations` |
| **(b) Hard TTL + bulk nonce revocation** | absolute expiry per link, plus one `incrementNonce(delegator)` that invalidates *all* of a delegator's outstanding delegations in a single SSTORE | **reused**: deployed `TimestampEnforcer` + `NonceEnforcer` |
| **(c) Heartbeat freshness** *(novel)* | redemption requires a fresh, EIP‑712‑signed off‑chain heartbeat; **revoke = stop signing**; passively expires authority under network partition / sequencer censorship where an on‑chain disable can be delayed | **new**: [`HeartbeatEnforcer.sol`](src/HeartbeatEnforcer.sol) |

**Proven bound:** `window ≤ min(remaining_TTL, heartbeat_TTL, τ_disable)` where `τ_disable = p99(inclusion+finality)`
absent censorship, or the L1 force‑inclusion ceiling under it. The heartbeat term gives a tight, passive
upper bound that holds even when the chain is being censored.

## Architecture — reuse the audited, build the missing piece

The entire layer‑(a)/(b) infrastructure is **already deployed and audited** on Arbitrum, so RevGuard
adds exactly **one** new enforcer plus a read‑only lens. This is a deliberate smart‑contract‑quality
choice: don't re‑implement audited money‑path code.

```
                        ┌─────────────────────────────────────────────┐
   user revoke ───────► │  RevGuard authored (this repo)              │
   (1 tx or silence)    │   • HeartbeatEnforcer.sol   (layer c, novel)│
                        │   • RevGuardLens.sol        (read-only)     │
                        │   • RevGuardAccount.sol     (demo root acct)│
                        └───────────────┬─────────────────────────────┘
                                        │ ICaveatEnforcer (beforeHook)
                        ┌───────────────▼─────────────────────────────┐
   agent redeem ──────► │  MetaMask Delegation Framework v1.3 (live)  │
                        │   • DelegationManager  0xdb9B…47dB3 (layer a)│
                        │   • TimestampEnforcer  0x1046…c069  (layer b)│
                        │   • NonceEnforcer      0xDE4f…254f  (layer b)│
                        └─────────────────────────────────────────────┘
                                    Arbitrum Sepolia (421614)
```

### Canonical addresses (verified live on Arbitrum Sepolia — see Pre‑flight)

| Contract | Address |
|---|---|
| DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| TimestampEnforcer | `0x1046bb45C8d673d4ea75321280DB34899413c069` |
| NonceEnforcer | `0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f` |

## Repository layout

```
src/
  HeartbeatEnforcer.sol      # layer (c): EIP-712 signed heartbeat freshness — the novel contract
  RevGuardLens.sol           # read-only chain preview + windowBound (UX/measurement)
  RevGuardAccount.sol        # minimal ERC-1271+7579 root account for demo/tests
  libraries/HeartbeatLib.sol # terms/args encoding + EIP-712 typehash (SDK mirrors this)
script/
  Addresses.sol              # canonical framework addresses
  DeployRevGuard.s.sol       # deploys HeartbeatEnforcer + RevGuardLens, writes deployments/, verifies
  DemoOnChain.s.sol          # end-to-end CLI demo (runs on a fork of real Arbitrum)
test/                        # 21 tests against the REAL framework (deployed locally + fork-compatible)
sim/                         # original Python proof harness (formal model, 600-run adversarial sim)
sdk/                         # TypeScript + viem developer SDK (heartbeat service, encoders, redeem/revoke)
```

## Quickstart

```bash
forge install                # pulls MetaMask/delegation-framework@v1.3.0 + deps
forge build
forge test -vvv              # 21 tests, all green
forge snapshot               # writes .gas-snapshot (measured, not estimated)
```

### Run the end‑to‑end demo against **real** Arbitrum Sepolia state

```bash
forge script script/DemoOnChain.s.sol --tc DemoOnChain \
  --fork-url https://sepolia-rollup.arbitrum.io/rpc -vv
```

Output (against the live `0xdb9B…` DelegationManager):

```
[1] Agent redeems a fresh depth-3 chain ...      -> OK. counter = 1
[2] Deterministic revocation bound = 39 s
[3] User revokes root authority (single bumpNonce) ...
[4] Agent retries the SAME signed chain ...       -> BLOCKED at link 1 reason: NONCE_REVOKED
    counter still = 1 (unchanged)
```

### Deploy to Arbitrum Sepolia (deploy‑ready)

```bash
cp .env.example .env            # fill ARB_SEPOLIA_RPC, DEPLOYER_PK (funded), ARBISCAN_KEY
forge script script/DeployRevGuard.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC --broadcast \
  --verify --verifier etherscan --etherscan-api-key $ARBISCAN_KEY
```

Only two contracts deploy (`HeartbeatEnforcer`, `RevGuardLens`); everything else is reused on‑chain.
Faucets: [Alchemy](https://www.alchemy.com/faucets/arbitrum-sepolia) ·
[ETHGlobal](https://ethglobal.com/faucet) — fund the deployer a day early.

### Pre‑flight (proves the reuse claim)

```bash
cast code 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3 --rpc-url $ARB_SEPOLIA_RPC   # → bytecode present
```

---

## How this maps to the judging criteria

**Smart contract quality.** We reuse the audited, live MetaMask `DelegationManager` + `TimestampEnforcer`
+ `NonceEnforcer` (two Consensys Diligence audits) and add **one** focused contract that implements the
real `ICaveatEnforcer` interface and OpenZeppelin `EIP712` + `ECDSA`. Custom errors, fixed‑width terms,
clock‑skew guard, default‑execution‑mode restriction. **21 tests** exercise the full flow against the
**real** DelegationManager (deployed locally from the audited source *and* verified compatible on an
Arbitrum Sepolia fork). Gas is **measured, not estimated** (`.gas-snapshot`):

| Operation | Gas (measured) |
|---|---|
| `HeartbeatEnforcer.beforeHook` (fresh, incl. EIP‑712 + ecrecover) | **~8.0k** |
| `setSigner` (one‑time registration) | ~45k |
| full depth‑3 `redeemDelegations` (3 caveats + execution) | ~190k |

The novel layer‑(c) overhead is the ~8k `beforeHook` — **lower** than the paper's analytic 19,443‑gas
estimate.

**Real problem solving.** Unbounded revocation latency in multi‑hop agent delegation is a concrete,
unsolved safety gap for agentic wallets. The adversarial test suite ports four attacker models
(front‑running redeemer, non‑propagating hop, offline hop, sequencer censorship) and shows **zero bound
violations** — authority is denied within the bound in every case, including when no on‑chain revocation
can land.

**Innovation & creativity.** The `HeartbeatEnforcer` introduces a *passive* off‑chain revocation channel
(revoke‑by‑silence) into the on‑chain caveat model, and the composition makes the worst‑case window
**depth‑independent** — disabling the root collapses a chain of any depth in `O(1)`.

**Product‑market fit.** Every team shipping agent wallets on Arbitrum that uses ERC‑7710 redelegation
needs a revocation guarantee they can put in a security review. RevGuard is a drop‑in caveat (one
`HeartbeatEnforcer` address + an SDK) on top of infrastructure they're already using.

---

## From research to chain

This project is the on‑chain realization of the paper *"RevGuard: Deterministically Bounding
Revocation‑to‑Enforcement Latency in Multi‑Hop ERC‑7710 Agent Redelegation Chains."* The original
formal model and 600‑run adversarial simulator live in [`sim/`](sim/) and still pass
(`cd sim && python3 -m revguard.cli simulate --runs 600` → 0 bound violations, 0% post‑revocation
false‑accept vs 63–83% for baselines). Every Solidity contract and test maps back to a function in
`sim/revguard/core.py`.

## Honest limitations

- **Heartbeat liveness.** Layer (c)'s tight bound assumes the heartbeat service is live; if it stops,
  authority safely expires (fails closed) but legitimate use is also paused. Decentralizing the signer
  (threshold / restaking) is future work.
- **Censorship latency** is modeled, not live‑measurable in a hackathon; the demo shows the
  no‑censorship fast path on a real fork. The force‑inclusion ceiling is carried from the simulator.
- **`RevGuardAccount`** is a minimal demo root account; production should use MetaMask's audited
  `HybridDeleGator` (factory + impl addresses in `script/Addresses.sol`).

## License

MIT. Built on the MetaMask Delegation Framework (MIT AND Apache‑2.0).
