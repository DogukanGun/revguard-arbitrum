# RevGuard — Deterministic Revocation Window for ERC-7710 Redelegation

A minimal, dependency-free **reference prototype** of the winning design from the
`redelegation-revocation-window` experiment: a *measurable, deterministic upper
bound* on revocation-to-enforcement latency for multi-hop ERC-7710 redelegation
chains, achieved by layering three primitives that each need **no cooperation
from any downstream link**.

## What it does

It models the enforcer state + off-chain heartbeat service and proves the bound
by simulation. The three layers:

- **(a) Full-chain re-validation at redemption** — `redeem()` re-checks every
  link, so disabling any ancestor atomically reverts the entire subtree.
- **(b) Hard TimestampEnforcer TTL + per-delegator epoch-nonce bulk revocation**
  — `revoke()` / `bump_epoch()`; both expire authority passively.
- **(c) Heartbeat-bound off-chain freshness proofs** — short-TTL signed
  heartbeats expire authority even under partition or a withholding intermediary.

**Guarantee (holds under every adversary):**

```
window  <=  min(remaining_TTL, heartbeat_TTL)
```

**Fast path (on-chain revoke lands via private builder / Flashbots):**

```
window  ~=  min(remaining_TTL, p99_inclusion+finality)
```

The simulator benchmarks this candidate on **two clocks** (wall-clock latency
and unauthorized-operation count) across delegation depths 1–5 and adversarial
intermediaries (front-running redeemer, non-propagating hop, offline hop,
sequencer censorship), against **expiry-only** and **registry-boolean**
baselines, and asserts the bound is never violated.

## Layout

```
revguard/
  models.py   # Delegation, Caveat, Heartbeat, Decision
  core.py     # RevGuard engine, deterministic bound, two-clock simulate()
  cli.py      # demo + benchmark entry point
tests/
  test_smoke.py
```

## Run it

No third-party dependencies — Python 3.11+ standard library only.

```bash
# Walk through the three revocation layers on a depth-3 chain
python -m revguard.cli demo

# Two-clock benchmark vs baselines (JSON metrics)
python -m revguard.cli simulate --runs 600 --seed 1

# Same, as Prometheus text-exposition (defender-vs-attacker dashboard)
python -m revguard.cli metrics --runs 600

# Smoke test
python tests/test_smoke.py
```

Example `simulate` output includes `candidate_bound_violations: 0`,
`candidate_false_accept_rate: 0.0`, a depth-flat window
(`depth_correlation ~ 0`), `candidate_window_worstcase_s ~ heartbeat_TTL`, and
both baselines showing a strictly higher false-accept rate.

## Scope / limitations

This is a research prototype, not the on-chain library. It is an executable
**reference model** of the enforcement logic and the deterministic bound; the
production path maps `revoke`/`bump_epoch` onto caveat-enforcer SSTOREs and
`redeem` onto the MetaMask DelegationManager's full-chain validation. Latencies
(inclusion+finality, force-inclusion) are modeled, not measured on-chain.
