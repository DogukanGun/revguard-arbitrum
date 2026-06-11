// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Delegation, Caveat } from "delegation-framework/src/utils/Types.sol";

interface IDelegationManagerLike {
    function disabledDelegations(bytes32 _delegationHash) external view returns (bool);
    function getDelegationHash(Delegation calldata _delegation) external pure returns (bytes32);
}

interface INonceEnforcerLike {
    function currentNonce(address _delegationManager, address _delegator) external view returns (uint256);
}

interface IHeartbeatEnforcerLike {
    function signerOf(address _delegator) external view returns (address);
}

/**
 * @title RevGuardLens
 * @notice Read-only companion to the deployed MetaMask DelegationManager. It mirrors the Python
 *         reference `redeem()` walk (`sim/revguard/core.py`) so a UI/CLI can show *why* a redemption
 *         would fail and *what* the bounded revocation window is — WITHOUT gating execution itself
 *         (the audited DelegationManager remains the sole enforcement point).
 *
 * @dev    Derived from `sim/revguard/core.py`:
 *           - `previewChain`  <- `redeem()` full-chain walk + `Decision`
 *           - `windowBound`   <- `window_bound()` = min(remaining_TTL, heartbeat_TTL)
 *
 *         The lens checks the three RevGuard layers against live on-chain state:
 *           (a) disabled flag          -> DelegationManager.disabledDelegations(hash)
 *           (b) hard TTL               -> TimestampEnforcer terms vs block.timestamp
 *           (b) bulk nonce revocation  -> NonceEnforcer.currentNonce(manager, delegator)
 *           (c) heartbeat freshness    -> issuedAt + ttl vs now, and signer registration
 */
contract RevGuardLens {
    IDelegationManagerLike public immutable DELEGATION_MANAGER;
    address public immutable TIMESTAMP_ENFORCER;
    INonceEnforcerLike public immutable NONCE_ENFORCER;
    IHeartbeatEnforcerLike public immutable HEARTBEAT_ENFORCER;

    constructor(address _manager, address _timestampEnforcer, address _nonceEnforcer, address _heartbeatEnforcer) {
        DELEGATION_MANAGER = IDelegationManagerLike(_manager);
        TIMESTAMP_ENFORCER = _timestampEnforcer;
        NONCE_ENFORCER = INonceEnforcerLike(_nonceEnforcer);
        HEARTBEAT_ENFORCER = IHeartbeatEnforcerLike(_heartbeatEnforcer);
    }

    /**
     * @notice The deterministic worst-case revocation-to-enforcement window for a link, in seconds.
     * @dev    min(remaining hard TTL, heartbeat freshness TTL). The on-chain disable-latency term
     *         (p99 inclusion+finality) is environmental and is reported off-chain by the SDK.
     * @param _notAfter The link's TimestampEnforcer `before` threshold (absolute unix seconds).
     * @param _heartbeatTtl The link's HeartbeatEnforcer TTL (seconds).
     */
    function windowBound(uint256 _notAfter, uint256 _heartbeatTtl) public view returns (uint256) {
        uint256 remainingTtl_ = _notAfter > block.timestamp ? _notAfter - block.timestamp : 0;
        return remainingTtl_ < _heartbeatTtl ? remainingTtl_ : _heartbeatTtl;
    }

    /**
     * @notice Mirror of the Python `redeem()` chain walk for display purposes.
     * @dev    Walks root..leaf and returns the first link that would fail, with a human-readable reason.
     *         `heartbeatIssuedAt[i]` is the issuance timestamp of the freshest heartbeat the redeemer
     *         holds for link i (0 if none / not heartbeat-gated). Signature validity is intentionally
     *         NOT re-checked here — that is the enforcer's job at redemption; this is a UX preview.
     * @param _chain The ordered delegation chain (index 0 = root).
     * @param _heartbeatIssuedAt Parallel array of heartbeat issuance timestamps.
     * @return ok True if every link currently passes all three layers.
     * @return failingIndex Index of the first failing link (0 when ok).
     * @return reason Status string: "ok" | "DISABLED" | "TTL_NOT_STARTED" | "TTL_EXPIRED" | "NONCE_REVOKED" | "HEARTBEAT_NO_SIGNER" | "HEARTBEAT_STALE".
     */
    function previewChain(
        Delegation[] calldata _chain,
        uint64[] calldata _heartbeatIssuedAt
    )
        external
        view
        returns (bool ok, uint256 failingIndex, string memory reason)
    {
        for (uint256 i = 0; i < _chain.length; ++i) {
            Delegation calldata d = _chain[i];

            // (a) single-delegation disable
            bytes32 hash_ = DELEGATION_MANAGER.getDelegationHash(d);
            if (DELEGATION_MANAGER.disabledDelegations(hash_)) return (false, i, "DISABLED");

            for (uint256 c = 0; c < d.caveats.length; ++c) {
                Caveat calldata cav = d.caveats[c];

                if (cav.enforcer == TIMESTAMP_ENFORCER) {
                    (uint128 after_, uint128 before_) = _decodeTimestamp(cav.terms);
                    if (after_ != 0 && block.timestamp <= after_) return (false, i, "TTL_NOT_STARTED");
                    if (before_ != 0 && block.timestamp >= before_) return (false, i, "TTL_EXPIRED");
                } else if (cav.enforcer == address(NONCE_ENFORCER)) {
                    uint256 stamped_ = abi.decode(cav.terms, (uint256));
                    uint256 current_ = NONCE_ENFORCER.currentNonce(address(DELEGATION_MANAGER), d.delegator);
                    if (stamped_ != current_) return (false, i, "NONCE_REVOKED");
                } else if (cav.enforcer == address(HEARTBEAT_ENFORCER)) {
                    if (HEARTBEAT_ENFORCER.signerOf(d.delegator) == address(0)) {
                        return (false, i, "HEARTBEAT_NO_SIGNER");
                    }
                    uint256 ttl_ = abi.decode(cav.terms, (uint256));
                    if (block.timestamp > uint256(_heartbeatIssuedAt[i]) + ttl_) return (false, i, "HEARTBEAT_STALE");
                }
            }
        }
        return (true, 0, "ok");
    }

    function _decodeTimestamp(bytes calldata _terms) internal pure returns (uint128 after_, uint128 before_) {
        // TimestampEnforcer layout: bytes16(after) ++ bytes16(before)
        before_ = uint128(bytes16(_terms[16:]));
        after_ = uint128(bytes16(_terms[:16]));
    }
}
