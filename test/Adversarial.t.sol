// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { RevGuardTestBase } from "./RevGuardTestBase.sol";
import { Delegation } from "delegation-framework/src/utils/Types.sol";
import { RevGuardAccount } from "../src/RevGuardAccount.sol";

/**
 * @title AdversarialTest
 * @notice Ports the adversary scenarios from `sim/revguard/core.py` `simulate()` to the real
 *         DelegationManager: front-running redeemer, uncooperative intermediary, and the
 *         sequencer-censorship backstop where the heartbeat passively bounds the window.
 */
contract AdversarialTest is RevGuardTestBase {
    /// @notice front_running: a delegation signed BEFORE revocation cannot settle AFTER it, because
    ///         re-validation happens at redemption time, not at signing time.
    function test_frontRunningRedeemer_stillBlocked() public {
        (Delegation[] memory chain, RevGuardAccount root,, address agent) = _buildChain(3);
        _attachFreshHeartbeat(chain); // chain + signatures are fully valid here

        // User revokes (root disable lands).
        Delegation memory rootDel = _rootDelegation(chain);
        vm.prank(address(root));
        manager.disableDelegation(rootDel);

        // The agent races with its already-signed delegation. Re-validation defeats it.
        vm.expectRevert();
        _redeem(chain, agent);
        assertEq(counter.count(), 0, "pre-signed redemption must not settle post-revocation");
    }

    /// @notice non_propagating: disabling ANY ancestor (here a middle hop) collapses the subtree below it,
    ///         with no cooperation from downstream links.
    function test_uncooperativeMiddleHop_disableCollapsesSubtree() public {
        (Delegation[] memory chain,,, address agent) = _buildChain(3);
        _attachFreshHeartbeat(chain);

        // chain is leaf->root: [hop2->agent, hop1->hop2, root->hop1]. The middle link is index 1.
        Delegation memory mid = chain[1];
        vm.prank(mid.delegator); // the middle delegator disables its own link out-of-band
        manager.disableDelegation(mid);

        vm.expectRevert();
        _redeem(chain, agent);
        assertEq(counter.count(), 0, "disabling a middle ancestor must collapse the subtree");
    }

    /// @notice censorship: if the on-chain disable is censored and never lands, the heartbeat passively
    ///         expires authority. The measured window equals the deterministic bound exactly:
    ///         valid through (lastBeat + bound), denied immediately after.
    function test_sequencerCensorship_heartbeatBoundsWindow() public {
        (Delegation[] memory chain,,, address agent) = _buildChain(3);

        uint256 t0 = block.timestamp;
        _attachFreshHeartbeat(chain); // last heartbeat the (soon-silent) service ever signs, issued at t0

        uint256 notAfter = t0 + HARD_TTL; // root TimestampEnforcer threshold
        uint256 bound = lens.windowBound(notAfter, HB_TTL); // = min(remaining hard TTL, HB_TTL) = HB_TTL
        assertEq(bound, HB_TTL, "heartbeat is the binding term");

        // Service is now censored/silent. At the exact bound edge, authority still holds.
        vm.warp(t0 + bound);
        _redeem(chain, agent);
        assertEq(counter.count(), 1, "authority valid through the bound");

        // One second past the bound: denied, with NO on-chain revocation having landed.
        vm.warp(t0 + bound + 1);
        vm.expectRevert();
        _redeem(chain, agent);
        assertEq(counter.count(), 1, "authority denied immediately past the bound (zero bound violations)");
    }
}
