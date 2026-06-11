// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Script, console2 } from "forge-std/Script.sol";

import { DelegationManager } from "delegation-framework/src/DelegationManager.sol";
import { TimestampEnforcer } from "delegation-framework/src/enforcers/TimestampEnforcer.sol";
import { NonceEnforcer } from "delegation-framework/src/enforcers/NonceEnforcer.sol";
import { Delegation, Caveat, ModeCode } from "delegation-framework/src/utils/Types.sol";
import { ModeLib } from "@erc7579/lib/ModeLib.sol";
import { ExecutionLib } from "@erc7579/lib/ExecutionLib.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import { HeartbeatEnforcer } from "../src/HeartbeatEnforcer.sol";
import { RevGuardLens } from "../src/RevGuardLens.sol";
import { RevGuardAccount } from "../src/RevGuardAccount.sol";
import { HeartbeatLib } from "../src/libraries/HeartbeatLib.sol";
import { Counter } from "../test/mocks/Counter.sol";
import { Addresses } from "./Addresses.sol";

/// @notice Stand-in for the autonomous agent (the leaf delegate). A contract so a reverting redemption
///         can be caught/reported in the demo without relying on the ephemeral script address.
contract DemoAgent {
    function redeem(
        DelegationManager _manager,
        bytes[] calldata _contexts,
        ModeCode[] calldata _modes,
        bytes[] calldata _execs
    )
        external
    {
        _manager.redeemDelegations(_contexts, _modes, _execs);
    }
}

/**
 * @title DemoOnChain
 * @notice The RevGuard end-to-end story, runnable as a CLI demo. Build a depth-3 ERC-7710 chain
 *         root -> hop1 -> agent, redeem successfully, print the deterministic revocation bound, then
 *         revoke and show the agent can no longer act — within the bound, depth-independently.
 *
 * Run against a fork of real Arbitrum Sepolia (uses the canonical, audited DelegationManager +
 * TimestampEnforcer + NonceEnforcer live on-chain):
 *
 *   forge script script/DemoOnChain.s.sol --fork-url $ARB_SEPOLIA_RPC -vv
 *
 * Runs locally too (auto-deploys a fresh framework when the canonical addresses are absent).
 */
contract DemoOnChain is Script {
    bytes32 internal constant ROOT_AUTHORITY = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    uint256 internal constant HARD_TTL = 3600;
    uint256 internal constant HB_TTL = 39;

    DelegationManager manager;
    TimestampEnforcer timestampEnforcer;
    NonceEnforcer nonceEnforcer;
    HeartbeatEnforcer heartbeat;
    RevGuardLens lens;
    Counter counter;
    ModeCode singleMode;

    // Actors (deterministic demo keys — never reuse on mainnet).
    uint256 rootOwnerPk = uint256(keccak256("revguard.demo.rootOwner"));
    uint256 hop1Pk = uint256(keccak256("revguard.demo.hop1"));
    uint256 hbSignerPk = uint256(keccak256("revguard.demo.hbSigner"));

    RevGuardAccount root;
    DemoAgent agentAcct;

    function run() external {
        singleMode = ModeLib.encodeSimpleSingle();
        _wireInfra();

        console2.log("=========================================================");
        console2.log(" RevGuard  -  bounded revocation for agent delegation chains");
        console2.log(" DelegationManager:", address(manager));
        console2.log(" HeartbeatEnforcer:", address(heartbeat));
        console2.log("=========================================================");

        // --- Build a depth-3 chain: root(smart account) -> hop1(EOA) -> agent(contract) ---
        address hop1 = vm.addr(hop1Pk);
        agentAcct = new DemoAgent();
        address agent = address(agentAcct);
        address hbSigner = vm.addr(hbSignerPk);

        root = new RevGuardAccount(vm.addr(rootOwnerPk));
        vm.prank(address(root));
        heartbeat.setSigner(hbSigner);

        // root -> hop1 (carries the 3 RevGuard caveats), then hop1 -> agent.
        Delegation memory rootDel = _signed(
            Delegation({
                delegate: hop1,
                delegator: address(root),
                authority: ROOT_AUTHORITY,
                caveats: _revGuardCaveats(address(root)),
                salt: 0,
                signature: ""
            }),
            rootOwnerPk
        );
        Delegation memory hopDel = _signed(
            Delegation({
                delegate: agent,
                delegator: hop1,
                authority: manager.getDelegationHash(rootDel),
                caveats: new Caveat[](0),
                salt: 0,
                signature: ""
            }),
            hop1Pk
        );

        // leaf -> root order for redemption.
        Delegation[] memory chain = new Delegation[](2);
        chain[0] = hopDel;
        chain[1] = rootDel;

        console2.log("\n[1] Agent redeems a fresh depth-3 chain ...");
        _attachHeartbeat(chain, hbSignerPk);
        _redeem(chain);
        console2.log("    -> OK. counter =", counter.count());

        uint256 bound = lens.windowBound(block.timestamp + HARD_TTL, HB_TTL);
        console2.log("\n[2] Deterministic revocation bound = min(remaining TTL, heartbeat TTL) =", bound, "s");

        console2.log("\n[3] User revokes root authority (single bumpNonce) ...");
        vm.prank(address(root));
        nonceEnforcer.incrementNonce(address(manager));

        console2.log("[4] Agent retries the SAME signed chain ...");
        _attachHeartbeat(chain, hbSignerPk);
        (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory execs) = _redeemArgs(chain);
        try agentAcct.redeem(manager, contexts, modes, execs) {
            console2.log("    -> UNEXPECTED: redemption succeeded");
        } catch {
            (, uint256 idx, string memory reason) = lens.previewChain(chain, _issued());
            console2.log("    -> BLOCKED at link", idx, "reason:", reason);
        }
        console2.log("    counter still =", counter.count(), "(unchanged)");

        console2.log("\nRevocation enforced deterministically, depth-independently, on Arbitrum.");
    }

    // --- infra ----------------------------------------------------------

    function _wireInfra() internal {
        if (Addresses.DELEGATION_MANAGER.code.length > 0) {
            // Forked / live Arbitrum: reuse the canonical audited contracts.
            manager = DelegationManager(payable(Addresses.DELEGATION_MANAGER));
            timestampEnforcer = TimestampEnforcer(Addresses.TIMESTAMP_ENFORCER);
            nonceEnforcer = NonceEnforcer(Addresses.NONCE_ENFORCER);
        } else {
            // Local: deploy a fresh framework so the demo still runs offline.
            manager = new DelegationManager(msg.sender);
            timestampEnforcer = new TimestampEnforcer();
            nonceEnforcer = new NonceEnforcer();
        }
        heartbeat = new HeartbeatEnforcer();
        lens = new RevGuardLens(
            address(manager), address(timestampEnforcer), address(nonceEnforcer), address(heartbeat)
        );
        counter = new Counter();
    }

    // --- helpers (mirror RevGuardTestBase) ------------------------------

    function _revGuardCaveats(address _delegator) internal view returns (Caveat[] memory caveats) {
        caveats = new Caveat[](3);
        caveats[0] = Caveat({
            enforcer: address(timestampEnforcer),
            terms: abi.encodePacked(uint128(0), uint128(block.timestamp + HARD_TTL)),
            args: ""
        });
        caveats[1] = Caveat({
            enforcer: address(nonceEnforcer),
            terms: abi.encode(nonceEnforcer.currentNonce(address(manager), _delegator)),
            args: ""
        });
        caveats[2] = Caveat({ enforcer: address(heartbeat), terms: HeartbeatLib.encodeTerms(HB_TTL), args: "" });
    }

    function _signed(Delegation memory _d, uint256 _pk) internal view returns (Delegation memory) {
        bytes32 typed = MessageHashUtils.toTypedDataHash(manager.getDomainHash(), manager.getDelegationHash(_d));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_pk, typed);
        _d.signature = abi.encodePacked(r, s, v);
        return _d;
    }

    function _attachHeartbeat(Delegation[] memory _chain, uint256 _signerPk) internal view {
        Delegation memory rootDel = _chain[_chain.length - 1];
        bytes32 digest = heartbeat.heartbeatDigest(rootDel.delegator, uint64(block.timestamp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_signerPk, digest);
        _chain[_chain.length - 1].caveats[2].args =
            HeartbeatLib.encodeArgs(uint64(block.timestamp), abi.encodePacked(r, s, v));
    }

    function _issued() internal view returns (uint64[] memory a) {
        a = new uint64[](2);
        a[0] = uint64(block.timestamp);
        a[1] = uint64(block.timestamp);
    }

    function _redeemArgs(Delegation[] memory _chain)
        internal
        view
        returns (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory execs)
    {
        contexts = new bytes[](1);
        contexts[0] = abi.encode(_chain);
        modes = new ModeCode[](1);
        modes[0] = singleMode;
        execs = new bytes[](1);
        execs[0] = ExecutionLib.encodeSingle(address(counter), 0, abi.encodeCall(Counter.increment, ()));
    }

    function _redeem(Delegation[] memory _chain) internal {
        (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory execs) = _redeemArgs(_chain);
        agentAcct.redeem(manager, contexts, modes, execs);
    }
}
