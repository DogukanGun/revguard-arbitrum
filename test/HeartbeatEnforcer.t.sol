// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { ModeLib, ModeCode } from "@erc7579/lib/ModeLib.sol";

import { HeartbeatEnforcer } from "../src/HeartbeatEnforcer.sol";
import { HeartbeatLib } from "../src/libraries/HeartbeatLib.sol";

/// @notice Unit tests for RevGuard layer (c): the EIP-712 heartbeat freshness enforcer.
/// @dev Mirrors `sim/revguard/tests/test_smoke.py` heartbeat behaviour: fresh passes, stale/silence reverts.
contract HeartbeatEnforcerTest is Test {
    HeartbeatEnforcer internal enforcer;

    // The "DelegationManager" is the caller of beforeHook; we just need a stable msg.sender.
    address internal manager = makeAddr("DelegationManager");

    address internal delegator;
    uint256 internal signerPk;
    address internal signer;

    uint256 internal constant TTL = 39; // seconds (paper's heartbeat horizon)
    ModeCode internal singleDefaultMode;

    function setUp() public {
        enforcer = new HeartbeatEnforcer();
        singleDefaultMode = ModeLib.encodeSimpleSingle();

        (signer, signerPk) = makeAddrAndKey("heartbeatSigner");
        delegator = makeAddr("delegator");

        // Delegator registers its heartbeat signer (msg.sender == delegator).
        vm.prank(delegator);
        enforcer.setSigner(signer);

        // Start at a realistic non-zero timestamp.
        vm.warp(1_000_000);
    }

    // --- helpers ---------------------------------------------------------

    function _sign(address _delegator, uint64 _issuedAt, uint256 _pk) internal view returns (bytes memory) {
        bytes32 digest = enforcer.heartbeatDigest(_delegator, _issuedAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _callBeforeHook(uint256 _ttl, uint64 _issuedAt, bytes memory _sig, address _delegator) internal {
        bytes memory terms = HeartbeatLib.encodeTerms(_ttl);
        bytes memory args = HeartbeatLib.encodeArgs(_issuedAt, _sig);
        vm.prank(manager);
        enforcer.beforeHook(terms, args, singleDefaultMode, hex"", bytes32(0), _delegator, address(0xBEEF));
    }

    // --- tests -----------------------------------------------------------

    function test_freshHeartbeat_passes() public {
        uint64 issuedAt = uint64(block.timestamp);
        bytes memory sig = _sign(delegator, issuedAt, signerPk);
        _callBeforeHook(TTL, issuedAt, sig, delegator); // must not revert
    }

    function test_freshAtTtlBoundary_passes() public {
        uint64 issuedAt = uint64(block.timestamp);
        bytes memory sig = _sign(delegator, issuedAt, signerPk);
        vm.warp(block.timestamp + TTL); // exactly at the edge: now == issuedAt + ttl -> still valid
        _callBeforeHook(TTL, issuedAt, sig, delegator);
    }

    function test_staleHeartbeat_reverts() public {
        uint64 issuedAt = uint64(block.timestamp);
        bytes memory sig = _sign(delegator, issuedAt, signerPk);
        vm.warp(block.timestamp + TTL + 1); // one second past expiry
        bytes memory terms = HeartbeatLib.encodeTerms(TTL);
        bytes memory args = HeartbeatLib.encodeArgs(issuedAt, sig);
        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(HeartbeatEnforcer.StaleHeartbeat.selector, issuedAt, TTL, block.timestamp)
        );
        enforcer.beforeHook(terms, args, singleDefaultMode, hex"", bytes32(0), delegator, address(0xBEEF));
    }

    function test_wrongSigner_reverts() public {
        (, uint256 attackerPk) = makeAddrAndKey("attacker");
        uint64 issuedAt = uint64(block.timestamp);
        bytes memory sig = _sign(delegator, issuedAt, attackerPk); // signed by the wrong key
        bytes memory terms = HeartbeatLib.encodeTerms(TTL);
        bytes memory args = HeartbeatLib.encodeArgs(issuedAt, sig);
        vm.prank(manager);
        vm.expectRevert(); // BadHeartbeatSigner(expected, recovered)
        enforcer.beforeHook(terms, args, singleDefaultMode, hex"", bytes32(0), delegator, address(0xBEEF));
    }

    function test_noSignerRegistered_reverts() public {
        address stranger = makeAddr("stranger");
        uint64 issuedAt = uint64(block.timestamp);
        bytes memory sig = _sign(stranger, issuedAt, signerPk);
        bytes memory terms = HeartbeatLib.encodeTerms(TTL);
        bytes memory args = HeartbeatLib.encodeArgs(issuedAt, sig);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(HeartbeatEnforcer.NoHeartbeatSigner.selector, stranger));
        enforcer.beforeHook(terms, args, singleDefaultMode, hex"", bytes32(0), stranger, address(0xBEEF));
    }

    function test_futureDatedHeartbeat_reverts() public {
        uint64 issuedAt = uint64(block.timestamp + enforcer.MAX_CLOCK_SKEW() + 1);
        bytes memory sig = _sign(delegator, issuedAt, signerPk);
        bytes memory terms = HeartbeatLib.encodeTerms(TTL);
        bytes memory args = HeartbeatLib.encodeArgs(issuedAt, sig);
        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(HeartbeatEnforcer.FutureHeartbeat.selector, issuedAt, block.timestamp)
        );
        enforcer.beforeHook(terms, args, singleDefaultMode, hex"", bytes32(0), delegator, address(0xBEEF));
    }

    function test_invalidTermsLength_reverts() public {
        uint64 issuedAt = uint64(block.timestamp);
        bytes memory sig = _sign(delegator, issuedAt, signerPk);
        bytes memory badTerms = abi.encodePacked(uint64(TTL)); // 8 bytes, not 32
        bytes memory args = HeartbeatLib.encodeArgs(issuedAt, sig);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(HeartbeatEnforcer.InvalidTermsLength.selector, uint256(8)));
        enforcer.beforeHook(badTerms, args, singleDefaultMode, hex"", bytes32(0), delegator, address(0xBEEF));
    }

    /// @notice Revocation-by-silence: after the signer stops, the last proof expires and redemption is denied.
    function test_revokeBySilence_blocksAfterTtl() public {
        uint64 lastBeat = uint64(block.timestamp); // last heartbeat the service ever signs
        bytes memory sig = _sign(delegator, lastBeat, signerPk);

        // Still fresh moments later -> ok.
        vm.warp(block.timestamp + 5);
        _callBeforeHook(TTL, lastBeat, sig, delegator);

        // Service went silent; no newer proof exists. After TTL elapses, the same (now only) proof is stale.
        vm.warp(lastBeat + TTL + 1);
        bytes memory terms = HeartbeatLib.encodeTerms(TTL);
        bytes memory args = HeartbeatLib.encodeArgs(lastBeat, sig);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(HeartbeatEnforcer.StaleHeartbeat.selector, lastBeat, TTL, block.timestamp));
        enforcer.beforeHook(terms, args, singleDefaultMode, hex"", bytes32(0), delegator, address(0xBEEF));
    }
}
