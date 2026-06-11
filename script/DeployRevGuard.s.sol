// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Script, console2 } from "forge-std/Script.sol";

import { HeartbeatEnforcer } from "../src/HeartbeatEnforcer.sol";
import { RevGuardLens } from "../src/RevGuardLens.sol";
import { RevGuardAccount } from "../src/RevGuardAccount.sol";
import { Counter } from "../test/mocks/Counter.sol";
import { Addresses } from "./Addresses.sol";

/**
 * @title DeployRevGuard
 * @notice Deploys the two RevGuard-authored contracts (HeartbeatEnforcer + RevGuardLens) plus the demo
 *         fixtures (a RevGuardAccount root + a Counter) the dashboard needs to run a fully live redeem.
 *         Everything else (DelegationManager, TimestampEnforcer, NonceEnforcer) is reused from the
 *         canonical, already-deployed MetaMask Delegation Framework.
 *
 *         The demo root account's owner is derived deterministically from a fixed string so the web
 *         dashboard can re-derive the same key off-chain (testnet-only; holds no value).
 *
 * Usage (Arbitrum Sepolia):
 *   forge script script/DeployRevGuard.s.sol \
 *     --rpc-url $ARB_SEPOLIA_RPC --broadcast \
 *     --verify --verifier etherscan --etherscan-api-key $ARBISCAN_KEY
 *
 * Dry-run (no broadcast) just simulates and prints addresses.
 */
contract DeployRevGuard is Script {
    /// @dev Must match `sdk`/dashboard `demoActors` derivation: keccak256("revguard.demo.rootOwner").
    function demoOwner() public pure returns (address) {
        return vm.addr(uint256(keccak256("revguard.demo.rootOwner")));
    }

    function run() external {
        vm.startBroadcast();

        HeartbeatEnforcer heartbeat = new HeartbeatEnforcer();
        RevGuardLens lens = new RevGuardLens(
            Addresses.DELEGATION_MANAGER,
            Addresses.TIMESTAMP_ENFORCER,
            Addresses.NONCE_ENFORCER,
            address(heartbeat)
        );

        // Demo fixtures (so the dashboard never has to deploy anything).
        RevGuardAccount demoRoot = new RevGuardAccount(demoOwner());
        Counter demoCounter = new Counter();

        vm.stopBroadcast();

        console2.log("HeartbeatEnforcer :", address(heartbeat));
        console2.log("RevGuardLens      :", address(lens));
        console2.log("DelegationManager :", Addresses.DELEGATION_MANAGER);
        console2.log("TimestampEnforcer :", Addresses.TIMESTAMP_ENFORCER);
        console2.log("NonceEnforcer     :", Addresses.NONCE_ENFORCER);
        console2.log("demoRoot          :", address(demoRoot), "(owner)", demoOwner());
        console2.log("demoCounter       :", address(demoCounter));

        _writeDeployment(address(heartbeat), address(lens), address(demoRoot), address(demoCounter));
    }

    function _writeDeployment(address _heartbeat, address _lens, address _demoRoot, address _demoCounter) internal {
        string memory json = string.concat(
            "{\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "heartbeatEnforcer": "', vm.toString(_heartbeat), '",\n',
            '  "revGuardLens": "', vm.toString(_lens), '",\n',
            '  "delegationManager": "', vm.toString(Addresses.DELEGATION_MANAGER), '",\n',
            '  "timestampEnforcer": "', vm.toString(Addresses.TIMESTAMP_ENFORCER), '",\n',
            '  "nonceEnforcer": "', vm.toString(Addresses.NONCE_ENFORCER), '",\n',
            '  "demoRoot": "', vm.toString(_demoRoot), '",\n',
            '  "demoCounter": "', vm.toString(_demoCounter), '"\n',
            "}\n"
        );
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeFile(path, json);
        console2.log("Wrote", path);
    }
}
