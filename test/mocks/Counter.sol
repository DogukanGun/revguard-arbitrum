// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @notice Trivial execution target so a successful redemption has an observable effect.
contract Counter {
    uint256 public count;

    function increment() external {
        count += 1;
    }
}
