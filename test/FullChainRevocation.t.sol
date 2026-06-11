// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { RevGuardTestBase } from "./RevGuardTestBase.sol";
import { Delegation } from "delegation-framework/src/utils/Types.sol";
import { HeartbeatEnforcer } from "../src/HeartbeatEnforcer.sol";
import { RevGuardAccount } from "../src/RevGuardAccount.sol";
import { Counter } from "./mocks/Counter.sol";

/**
 * @title FullChainRevocationTest
 * @notice End-to-end proof of RevGuard's three revocation layers against the REAL DelegationManager.
 *         Each test redeems a multi-hop chain, then revokes via one layer and shows redemption fails.
 *         Mirrors `sim/revguard/core.py` `redeem()` + the three revocation paths.
 */
contract FullChainRevocationTest is RevGuardTestBase {
    function test_happyPath_redeems() public {
        (Delegation[] memory chain,,, address agent) = _buildChain(3);
        _attachFreshHeartbeat(chain);
        _redeem(chain, agent);
        assertEq(counter.count(), 1, "fresh chain should execute");
    }

    /// @notice Layer (a): disabling the root atomically collapses the whole subtree.
    function test_disableRoot_blocksRedeem() public {
        (Delegation[] memory chain, RevGuardAccount root,, address agent) = _buildChain(3);
        _attachFreshHeartbeat(chain);

        Delegation memory rootDel = _rootDelegation(chain);
        vm.prank(address(root));
        manager.disableDelegation(rootDel);

        vm.expectRevert(); // DelegationManager.CannotUseADisabledDelegation
        _redeem(chain, agent);
        assertEq(counter.count(), 0, "disabled root must block execution");
    }

    /// @notice Layer (b): one bumpNonce invalidates all of the delegator's outstanding delegations.
    function test_bumpNonce_blocksRedeem() public {
        (Delegation[] memory chain, RevGuardAccount root,, address agent) = _buildChain(3);
        _attachFreshHeartbeat(chain);

        vm.prank(address(root));
        nonceEnforcer.incrementNonce(address(manager));

        vm.expectRevert(); // NonceEnforcer:invalid-nonce
        _redeem(chain, agent);
        assertEq(counter.count(), 0, "bumped nonce must block execution");
    }

    /// @notice Layer (c): once the heartbeat service goes silent, the proof goes stale and redemption fails.
    function test_heartbeatSilence_blocksRedeemAfterTtl() public {
        (Delegation[] memory chain,,, address agent) = _buildChain(3);
        _attachFreshHeartbeat(chain); // last beat issued "now"

        // Still fresh shortly after.
        _redeem(chain, agent);
        assertEq(counter.count(), 1);

        // Service went silent. The same (now only) proof ages past the heartbeat TTL.
        vm.warp(block.timestamp + HB_TTL + 1);
        vm.expectRevert(); // HeartbeatEnforcer.StaleHeartbeat (hard TTL still valid: HARD_TTL >> HB_TTL)
        _redeem(chain, agent);
        assertEq(counter.count(), 1, "stale heartbeat must block further execution");
    }

    /// @notice Depth-independence: revoking the root blocks redemption at every chain depth (the paper's
    ///         depth_correlation ~ 0 / O(1) subtree-collapse property).
    function test_depthIndependence_disableRootAlwaysBlocks() public {
        for (uint256 depth = 1; depth <= 4; ++depth) {
            counter = new Counter(); // fresh effect counter per depth
            // refresh lens binding to new counter not needed; counter only used as exec target

            // Happy path at this depth.
            (Delegation[] memory chain, RevGuardAccount root,, address agent) = _buildChain(depth);
            _attachFreshHeartbeat(chain);
            _redeem(chain, agent);
            assertEq(counter.count(), 1, "happy path should work at this depth");

            // Disable the root -> redeem must fail regardless of depth.
            Delegation memory rootDel = _rootDelegation(chain);
            vm.prank(address(root));
            manager.disableDelegation(rootDel);

            vm.expectRevert();
            _redeem(chain, agent);
            assertEq(counter.count(), 1, "root disable must block at this depth");
        }
    }
}
