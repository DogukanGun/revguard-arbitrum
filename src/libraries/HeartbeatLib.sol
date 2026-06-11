// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title HeartbeatLib
 * @notice Single source of truth for the RevGuard heartbeat encoding: the EIP-712 typehash,
 *         the caveat `terms` layout (TTL), and the caveat `args` layout (the freshness proof).
 * @dev    The TypeScript SDK (`sdk/src/heartbeatTypes.ts`) mirrors these layouts byte-for-byte.
 *         A round-trip parity test (`test/EncodingParity.t.sol`) guards against drift.
 *
 *         Derived from the Python reference model in `sim/revguard/models.py` (`Heartbeat`) and
 *         the redemption freshness check in `sim/revguard/core.py` (`redeem` -> `fresh_at`).
 */
library HeartbeatLib {
    /// @notice EIP-712 struct hash type for a heartbeat freshness proof.
    /// @dev keccak256("Heartbeat(address delegator,uint64 issuedAt)")
    bytes32 internal constant HEARTBEAT_TYPEHASH = keccak256("Heartbeat(address delegator,uint64 issuedAt)");

    /**
     * @notice Encode the caveat `terms` carried by a HeartbeatEnforcer caveat.
     * @dev    Fixed 32 bytes (one word) holding the freshness TTL in seconds. Fixed-width terms
     *         match the convention used by the framework's TimestampEnforcer / NonceEnforcer.
     * @param _ttlSeconds The maximum age (seconds) a heartbeat may have at redemption time.
     */
    function encodeTerms(uint256 _ttlSeconds) internal pure returns (bytes memory) {
        return abi.encode(_ttlSeconds);
    }

    /**
     * @notice Encode the caveat `args` (the freshness proof) supplied by the redeemer at redemption.
     * @dev    `args` is intentionally NOT part of the framework's caveat hash, so the agent can
     *         attach the freshest heartbeat it holds at redemption time without re-signing the delegation.
     * @param _issuedAt The unix second at which the heartbeat was signed.
     * @param _signature 65-byte ECDSA signature over the EIP-712 Heartbeat digest.
     */
    function encodeArgs(uint64 _issuedAt, bytes memory _signature) internal pure returns (bytes memory) {
        return abi.encode(_issuedAt, _signature);
    }

    /// @notice The EIP-712 struct hash for a single heartbeat.
    function structHash(address _delegator, uint64 _issuedAt) internal pure returns (bytes32) {
        return keccak256(abi.encode(HEARTBEAT_TYPEHASH, _delegator, _issuedAt));
    }
}
