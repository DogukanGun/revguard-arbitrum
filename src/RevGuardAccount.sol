// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { ModeCode } from "delegation-framework/src/utils/Types.sol";
import { ExecutionLib } from "@erc7579/lib/ExecutionLib.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title RevGuardAccount
 * @notice A minimal ERC-1271 + ERC-7579-executor smart account used as the ROOT delegator in RevGuard
 *         chains. The MetaMask DelegationManager performs the final execution on the root delegator's
 *         account (`executeFromExecutor`) and validates the root delegation via ERC-1271, so the root
 *         must be a contract; intermediate hops and the leaf agent remain plain EOAs.
 *
 * @dev    Deliberately minimal: single-owner ECDSA signature validation and single-call execution.
 *         For production, swap in MetaMask's audited HybridDeleGator (SimpleFactory + HybridDeleGatorImpl,
 *         addresses in `script/Addresses.sol`); this contract exists so the demo and unit tests are
 *         self-contained and reproducible. It is NOT a full ERC-4337 account.
 */
contract RevGuardAccount {
    using ExecutionLib for bytes;

    bytes4 internal constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

    /// @notice The EOA whose signatures authorize this account's delegations and executions.
    address public immutable owner;

    error ExecutionFailed(address target, bytes returnData);

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice ERC-1271: accept signatures produced by `owner` over `_hash`.
    function isValidSignature(bytes32 _hash, bytes calldata _signature) external view returns (bytes4) {
        if (ECDSA.recover(_hash, _signature) == owner) return EIP1271_MAGIC_VALUE;
        return 0xffffffff;
    }

    /// @notice ERC-7579 single execution, invoked by the DelegationManager once every beforeHook passes.
    function executeFromExecutor(
        ModeCode,
        bytes calldata _executionCalldata
    )
        external
        payable
        returns (bytes[] memory returnData)
    {
        (address target_, uint256 value_, bytes calldata callData_) = _executionCalldata.decodeSingle();
        (bool ok_, bytes memory ret_) = target_.call{ value: value_ }(callData_);
        if (!ok_) revert ExecutionFailed(target_, ret_);
        returnData = new bytes[](1);
        returnData[0] = ret_;
    }

    receive() external payable { }
}
