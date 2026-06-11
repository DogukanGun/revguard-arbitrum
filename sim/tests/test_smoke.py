"""Smoke tests for the RevGuard prototype: redeem path + deterministic bound."""
from revguard import HEARTBEAT_TTL_S, RevGuard, simulate


def test_redeem_and_layers():
    g = RevGuard()
    now = 1000.0
    chain = g.build_chain("0xroot", n_hops=3, ttl_s=120.0, now=now)
    for d in chain:
        g.post_heartbeat(d.delegator, issued_at=now)

    assert g.redeem(chain, {}, now).allowed is True

    # (a) disabling any ancestor reverts the whole subtree at redemption.
    g.revoke(chain[0].delegation_hash)
    assert g.redeem(chain, {}, now).allowed is False
    g.revoked.clear()

    # (b) epoch-nonce bulk revocation.
    g.bump_epoch("0xhop1")
    assert g.redeem(chain, {}, now).reason == "EPOCH_BUMPED"
    g.epochs["0xhop1"] -= 1

    # (c) heartbeat passive expiry under a withholding intermediary.
    assert g.redeem(chain, {}, now + HEARTBEAT_TTL_S + 1.0).reason == "HEARTBEAT_STALE"


def test_deterministic_window_bound_holds():
    m = simulate(runs=120, seed=7)
    # The deterministic bound is never violated, under any adversary.
    assert m["candidate_bound_violations"] == 0.0
    assert m["candidate_false_accept_rate"] == 0.0
    # Worst-case window is capped by the heartbeat TTL passive backstop.
    assert m["candidate_window_worstcase_s"] <= HEARTBEAT_TTL_S + 1.0
    assert m["candidate_window_p99_s"] <= HEARTBEAT_TTL_S
    # Window is independent of delegation depth (full-chain re-validation).
    assert abs(m["depth_correlation"]) < 0.4
    # Candidate is depth-flat; the lease/expiry baseline is not.
    assert m["candidate_drcc_velocity_slope"] < m["lease_drcc_velocity_slope"]
    # Both baselines are strictly worse than the candidate.
    assert m["baseline_far_expiry_only"] > 0.0
    assert m["baseline_far_registry_boolean"] > 0.0


if __name__ == "__main__":
    test_redeem_and_layers()
    test_deterministic_window_bound_holds()
    print("smoke ok")
