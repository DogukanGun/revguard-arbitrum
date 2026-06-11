// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";

import { DelegationManager } from "delegation-framework/src/DelegationManager.sol";
import { TimestampEnforcer } from "delegation-framework/src/enforcers/TimestampEnforcer.sol";
import { NonceEnforcer } from "delegation-framework/src/enforcers/NonceEnforcer.sol";
import { Delegation, Caveat, ModeCode } from "delegation-framework/src/utils/Types.sol";
import { ModeLib } from "@erc7579/lib/ModeLib.sol";
import { ExecutionLib } from "@erc7579/lib/ExecutionLib.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import { HeartbeatEnforcer } from "../src/HeartbeatEnforcer.sol";
import { RevGuardLens } from "../src/RevGuardLens.sol";
import { HeartbeatLib } from "../src/libraries/HeartbeatLib.sol";
import { RevGuardAccount } from "../src/RevGuardAccount.sol";
import { Counter } from "./mocks/Counter.sol";

/**
 * @title RevGuardTestBase
 * @notice Deploys the REAL MetaMask Delegation Framework (DelegationManager + TimestampEnforcer +
 *         NonceEnforcer) locally alongside RevGuard's HeartbeatEnforcer + RevGuardLens, and provides
 *         helpers to build, sign, and redeem multi-hop ERC-7710 delegation chains.
 * @dev    Deploying the framework locally makes the full redeem→revoke→revert flow deterministic and
 *         network-free, while still exercising the exact audited bytecode used on Arbitrum. The
 *         `ForkParity` test separately asserts these locally-deployed contracts match the canonical
 *         on-chain addresses' behaviour.
 */
abstract contract RevGuardTestBase is Test {
    bytes32 internal constant ROOT_AUTHORITY = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    DelegationManager internal manager;
    TimestampEnforcer internal timestampEnforcer;
    NonceEnforcer internal nonceEnforcer;
    HeartbeatEnforcer internal heartbeat;
    RevGuardLens internal lens;
    Counter internal counter;

    // Heartbeat signing key shared by all delegators in tests (each registers it as its signer).
    uint256 internal hbSignerPk;
    address internal hbSigner;

    // The hard TTL is a coarse on-chain backstop; the heartbeat TTL is the tight passive bound.
    // RevGuard's window = min(remaining_hard_TTL, heartbeat_TTL, disable-latency) -> heartbeat usually binds.
    uint256 internal constant HARD_TTL = 3600; // TimestampEnforcer horizon (seconds)
    uint256 internal constant HB_TTL = 39; // HeartbeatEnforcer freshness horizon (seconds), matches the paper
    ModeCode internal singleMode;

    function setUp() public virtual {
        manager = new DelegationManager(address(this));
        timestampEnforcer = new TimestampEnforcer();
        nonceEnforcer = new NonceEnforcer();
        heartbeat = new HeartbeatEnforcer();
        lens = new RevGuardLens(
            address(manager), address(timestampEnforcer), address(nonceEnforcer), address(heartbeat)
        );
        counter = new Counter();
        singleMode = ModeLib.encodeSimpleSingle();

        (hbSigner, hbSignerPk) = makeAddrAndKey("hbSigner");
        vm.warp(1_000_000);
    }

    // --- caveat builders -------------------------------------------------

    function _timestampCaveat(uint256 _ttl) internal view returns (Caveat memory) {
        bytes memory terms = abi.encodePacked(uint128(0), uint128(block.timestamp + _ttl));
        return Caveat({ enforcer: address(timestampEnforcer), terms: terms, args: "" });
    }

    function _nonceCaveat(address _delegator) internal view returns (Caveat memory) {
        uint256 cur = nonceEnforcer.currentNonce(address(manager), _delegator);
        return Caveat({ enforcer: address(nonceEnforcer), terms: abi.encode(cur), args: "" });
    }

    function _heartbeatCaveat(uint256 _ttl) internal view returns (Caveat memory) {
        return Caveat({ enforcer: address(heartbeat), terms: HeartbeatLib.encodeTerms(_ttl), args: "" });
    }

    /// @notice The three RevGuard caveats: hard TTL, bulk-nonce, heartbeat freshness.
    function _revGuardCaveats(address _delegator) internal view returns (Caveat[] memory caveats) {
        caveats = new Caveat[](3);
        caveats[0] = _timestampCaveat(HARD_TTL);
        caveats[1] = _nonceCaveat(_delegator);
        caveats[2] = _heartbeatCaveat(HB_TTL);
    }

    // --- signing ---------------------------------------------------------

    function _sign(Delegation memory _d, uint256 _pk) internal view returns (bytes memory) {
        bytes32 delegationHash = manager.getDelegationHash(_d);
        bytes32 typed = MessageHashUtils.toTypedDataHash(manager.getDomainHash(), delegationHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_pk, typed);
        return abi.encodePacked(r, s, v);
    }

    /// @notice Builds an issued, fresh heartbeat proof (args) for `_delegator`.
    function _heartbeatArgs(address _delegator, uint64 _issuedAt) internal view returns (bytes memory) {
        bytes32 digest = heartbeat.heartbeatDigest(_delegator, _issuedAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(hbSignerPk, digest);
        return HeartbeatLib.encodeArgs(_issuedAt, abi.encodePacked(r, s, v));
    }

    // --- chain construction ----------------------------------------------

    /**
     * @notice Build a signed depth-`_depth` chain: rootAccount -> hop_1 -> ... -> agent.
     *         The ROOT delegation carries the three RevGuard caveats (the revocation target).
     * @dev Returns the chain ordered leaf->root (as `redeemDelegations` expects), plus the actors.
     */
    function _buildChain(uint256 _depth)
        internal
        returns (Delegation[] memory chainLeafToRoot, RevGuardAccount rootAccount, uint256 rootOwnerPk, address agent)
    {
        require(_depth >= 1, "depth>=1");

        // Actors: root is a smart account; hops + agent are EOAs.
        uint256 ownerPk;
        (, ownerPk) = makeAddrAndKey("rootOwner");
        rootOwnerPk = ownerPk;
        rootAccount = new RevGuardAccount(vm.addr(ownerPk));

        address[] memory delegators = new address[](_depth);
        uint256[] memory delegatorPks = new uint256[](_depth); // 0 for the root (signed via owner/1271)
        address[] memory delegates = new address[](_depth);

        delegators[0] = address(rootAccount);
        for (uint256 i = 1; i < _depth; ++i) {
            (address a, uint256 p) = makeAddrAndKey(string.concat("hop", vm.toString(i)));
            delegators[i] = a;
            delegatorPks[i] = p;
        }
        // delegates: each link's delegate is the next link's delegator; the final delegate is the agent.
        (address agentAddr, uint256 agentPk) = makeAddrAndKey("agent");
        agent = agentAddr;
        agentPk; // silence
        for (uint256 i = 0; i < _depth; ++i) {
            delegates[i] = (i + 1 < _depth) ? delegators[i + 1] : agentAddr;
        }

        // Register the heartbeat signer for every delegator.
        for (uint256 i = 0; i < _depth; ++i) {
            vm.prank(delegators[i]);
            heartbeat.setSigner(hbSigner);
        }

        // Build root-first so each child can reference its parent's hash as `authority`.
        Delegation[] memory rootToLeaf = new Delegation[](_depth);
        bytes32 parentHash = ROOT_AUTHORITY;
        for (uint256 i = 0; i < _depth; ++i) {
            Caveat[] memory caveats = (i == 0) ? _revGuardCaveats(delegators[i]) : new Caveat[](0);
            Delegation memory d = Delegation({
                delegate: delegates[i],
                delegator: delegators[i],
                authority: parentHash,
                caveats: caveats,
                salt: 0,
                signature: ""
            });
            d.signature = _sign(d, i == 0 ? rootOwnerPk : delegatorPks[i]);
            rootToLeaf[i] = d;
            parentHash = manager.getDelegationHash(d);
        }

        // Reverse into leaf->root order for redemption.
        chainLeafToRoot = new Delegation[](_depth);
        for (uint256 i = 0; i < _depth; ++i) {
            chainLeafToRoot[i] = rootToLeaf[_depth - 1 - i];
        }
    }

    /// @notice Attach a fresh heartbeat proof to the root delegation's heartbeat caveat (args).
    function _attachFreshHeartbeat(Delegation[] memory _chainLeafToRoot) internal view {
        // Root delegation is the last element (leaf->root order).
        Delegation memory root = _chainLeafToRoot[_chainLeafToRoot.length - 1];
        bytes memory args = _heartbeatArgs(root.delegator, uint64(block.timestamp));
        // caveats[2] is the heartbeat caveat (see _revGuardCaveats).
        _chainLeafToRoot[_chainLeafToRoot.length - 1].caveats[2].args = args;
    }

    // --- redemption ------------------------------------------------------

    function _redeem(Delegation[] memory _chainLeafToRoot, address _agent) internal {
        bytes memory exec = ExecutionLib.encodeSingle(address(counter), 0, abi.encodeCall(Counter.increment, ()));

        bytes[] memory contexts = new bytes[](1);
        contexts[0] = abi.encode(_chainLeafToRoot);
        ModeCode[] memory modes = new ModeCode[](1);
        modes[0] = singleMode;
        bytes[] memory execs = new bytes[](1);
        execs[0] = exec;

        vm.prank(_agent);
        manager.redeemDelegations(contexts, modes, execs);
    }

    /// @notice The root delegation (carrying the RevGuard caveats) of a leaf->root chain.
    function _rootDelegation(Delegation[] memory _chainLeafToRoot) internal pure returns (Delegation memory) {
        return _chainLeafToRoot[_chainLeafToRoot.length - 1];
    }
}
