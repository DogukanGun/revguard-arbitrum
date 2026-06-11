// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { RevGuardTestBase } from "./RevGuardTestBase.sol";
import { Delegation } from "delegation-framework/src/utils/Types.sol";
import { RevGuardAccount } from "../src/RevGuardAccount.sol";

/**
 * @title LensAndBoundTest
 * @notice Tests RevGuardLens: the deterministic window bound and the read-only chain preview that
 *         mirrors the Python `Decision` (first failing link + reason). The lens is a UX surface; it
 *         must agree with what the DelegationManager would actually do.
 */
contract LensAndBoundTest is RevGuardTestBase {
    function test_windowBound_isMinOfTtlAndHeartbeat() public {
        uint256 notAfter = block.timestamp + HARD_TTL;
        // Heartbeat (39) is much smaller than remaining hard TTL (3600) -> heartbeat binds.
        assertEq(lens.windowBound(notAfter, HB_TTL), HB_TTL);
        // If hard TTL is the smaller term, it binds instead.
        assertEq(lens.windowBound(block.timestamp + 10, HB_TTL), 10);
        // Past expiry -> zero.
        assertEq(lens.windowBound(block.timestamp, HB_TTL), 0);
    }

    function test_previewChain_okWhenFresh() public {
        (Delegation[] memory chain,,,) = _buildChain(3);
        _attachFreshHeartbeat(chain);
        uint64[] memory issuedAt = _issuedAtArray(chain, uint64(block.timestamp));

        (bool ok, uint256 idx, string memory reason) = lens.previewChain(chain, issuedAt);
        assertTrue(ok, "fresh chain previews ok");
        assertEq(idx, 0);
        assertEq(reason, "ok");
    }

    function test_previewChain_reportsDisabled() public {
        (Delegation[] memory chain, RevGuardAccount root,,) = _buildChain(3);
        _attachFreshHeartbeat(chain);
        uint64[] memory issuedAt = _issuedAtArray(chain, uint64(block.timestamp));

        Delegation memory rootDel = _rootDelegation(chain);
        vm.prank(address(root));
        manager.disableDelegation(rootDel);

        (bool ok,, string memory reason) = lens.previewChain(chain, issuedAt);
        assertFalse(ok);
        assertEq(reason, "DISABLED");
    }

    function test_previewChain_reportsNonceRevoked() public {
        (Delegation[] memory chain, RevGuardAccount root,,) = _buildChain(3);
        _attachFreshHeartbeat(chain);
        uint64[] memory issuedAt = _issuedAtArray(chain, uint64(block.timestamp));

        vm.prank(address(root));
        nonceEnforcer.incrementNonce(address(manager));

        (bool ok,, string memory reason) = lens.previewChain(chain, issuedAt);
        assertFalse(ok);
        assertEq(reason, "NONCE_REVOKED");
    }

    function test_previewChain_reportsHeartbeatStale() public {
        (Delegation[] memory chain,,,) = _buildChain(3);
        _attachFreshHeartbeat(chain);
        uint64 issued = uint64(block.timestamp);
        uint64[] memory issuedAt = _issuedAtArray(chain, issued);

        vm.warp(block.timestamp + HB_TTL + 1);
        (bool ok,, string memory reason) = lens.previewChain(chain, issuedAt);
        assertFalse(ok);
        assertEq(reason, "HEARTBEAT_STALE");
    }

    /// @dev The lens takes a per-link heartbeat issuance timestamp; only the root link is heartbeat-gated.
    function _issuedAtArray(Delegation[] memory _chain, uint64 _ts) internal pure returns (uint64[] memory arr) {
        arr = new uint64[](_chain.length);
        // Root is the last element; set its issuance, leave others as far-future (not gated).
        for (uint256 i = 0; i < _chain.length; ++i) {
            arr[i] = _ts;
        }
    }
}
