"""RevGuard CLI: demo the layered enforcer and run the two-clock benchmark.

Examples
--------
    python -m revguard.cli demo
    python -m revguard.cli simulate --runs 600 --seed 1
    python -m revguard.cli metrics --runs 600          # Prometheus exposition
"""
from __future__ import annotations

import argparse
import json

from .core import HEARTBEAT_TTL_S, RevGuard, prometheus_text, simulate


def _demo() -> None:
    """Walk through the three layers on a depth-3 chain."""
    g = RevGuard()
    now = 1000.0
    chain = g.build_chain("0xroot", n_hops=3, ttl_s=120.0, now=now)
    for d in chain:
        g.post_heartbeat(d.delegator, issued_at=now)

    print(f"Built depth-{len(chain)} chain (root -> hop1 -> hop2 -> hop3 redeemer)")
    print("Initial redeem:        ", g.redeem(chain, {}, now))

    bound = g.window_bound(chain[0], now, onchain_available=True)
    print(f"Deterministic bound:    {bound:.3f}s  = min(remaining_TTL=120, "
          f"heartbeat_TTL={HEARTBEAT_TTL_S}, p99_inclusion+finality)")

    # Layer (a): disable an ancestor -> whole subtree reverts at redemption.
    g.revoke(chain[0].delegation_hash)
    print("After revoking root:   ", g.redeem(chain, {}, now))
    g.revoked.clear()

    # Layer (b): epoch-nonce bulk revocation of everything hop1 delegated.
    g.bump_epoch("0xhop1")
    print("After bumpEpoch(hop1): ", g.redeem(chain, {}, now))
    g.epochs["0xhop1"] -= 1

    # Layer (c): heartbeat passive expiry under a withholding intermediary.
    later = now + HEARTBEAT_TTL_S + 1.0
    print("After heartbeat expiry:", g.redeem(chain, {}, later))


def _print_metrics(runs: int, seed: int, as_prom: bool) -> None:
    metrics = simulate(runs=runs, seed=seed)
    if as_prom:
        print(prometheus_text(metrics), end="")
    else:
        print(json.dumps(metrics, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="revguard", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("demo", help="walk through the three revocation layers")

    p_sim = sub.add_parser("simulate", help="two-clock benchmark vs baselines (JSON)")
    p_sim.add_argument("--runs", type=int, default=600)
    p_sim.add_argument("--seed", type=int, default=1)

    p_met = sub.add_parser("metrics", help="benchmark as Prometheus exposition")
    p_met.add_argument("--runs", type=int, default=600)
    p_met.add_argument("--seed", type=int, default=1)

    args = parser.parse_args(argv)
    if args.cmd == "demo":
        _demo()
    elif args.cmd == "simulate":
        _print_metrics(args.runs, args.seed, as_prom=False)
    elif args.cmd == "metrics":
        _print_metrics(args.runs, args.seed, as_prom=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
