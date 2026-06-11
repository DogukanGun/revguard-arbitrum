// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { CaveatEnforcer } from "delegation-framework/src/enforcers/CaveatEnforcer.sol";
import { ModeCode } from "delegation-framework/src/utils/Types.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { HeartbeatLib } from "./libraries/HeartbeatLib.sol";

/**
 * @title HeartbeatEnforcer
 * @notice RevGuard layer (c): a MetaMask Delegation Framework caveat enforcer that requires a fresh,
 *         EIP-712-signed off-chain "heartbeat" from the delegator for a redemption to succeed.
 *
 * @dev    The novel contribution of RevGuard. Layers (a) full-chain re-validation and (b) hard TTL +
 *         bulk nonce revocation are provided by the already-deployed DelegationManager, TimestampEnforcer
 *         and NonceEnforcer; this enforcer adds a *passive* revocation channel that needs no on-chain
 *         transaction and no cooperation from any downstream link:
 *
 *           Revoke == stop signing heartbeats.
 *
 *         Once the delegator's heartbeat service goes silent, the freshest proof an agent can present
 *         ages past `ttl` and every subsequent `redeemDelegations` reverts here. This bounds authority
 *         under network partition / sequencer censorship, where an on-chain `disableDelegation` may be
 *         delayed. Mirrors `sim/revguard/core.py` `post_heartbeat` / `fresh_at` and the redeem-time
 *         freshness check.
 *
 *         Operates in default execution mode only, matching the framework's TimestampEnforcer/NonceEnforcer.
 */
contract HeartbeatEnforcer is CaveatEnforcer, EIP712 {
    using HeartbeatLib for address;

    /// @notice Reject heartbeats dated more than this many seconds into the future (clock-skew guard).
    uint256 public constant MAX_CLOCK_SKEW = 15;

    /// @notice delegator => the address whose signature is accepted as that delegator's heartbeat.
    /// @dev    Set by the delegator itself (msg.sender). A delegator may delegate signing to a hot
    ///         "heartbeat key" distinct from its main key; revoking == the signer stops signing.
    mapping(address delegator => address signer) public signerOf;

    /// @notice Emitted when a delegator registers (or rotates) its heartbeat signer.
    event SignerSet(address indexed delegator, address indexed signer);

    error NoHeartbeatSigner(address delegator);
    error StaleHeartbeat(uint256 issuedAt, uint256 ttl, uint256 nowTs);
    error FutureHeartbeat(uint256 issuedAt, uint256 nowTs);
    error BadHeartbeatSigner(address expected, address recovered);
    error InvalidTermsLength(uint256 length);

    constructor() EIP712("RevGuardHeartbeat", "1") { }

    /**
     * @notice Register (or rotate) the heartbeat signer for the calling delegator.
     * @dev    msg.sender is the delegator (EOA or smart account). Setting the signer to the zero
     *         address effectively disables all of the delegator's heartbeat-gated delegations.
     * @param _signer The address whose EIP-712 heartbeat signatures will be accepted.
     */
    function setSigner(address _signer) external {
        signerOf[msg.sender] = _signer;
        emit SignerSet(msg.sender, _signer);
    }

    /**
     * @notice Enforces that a fresh, validly-signed heartbeat exists for the delegator.
     * @dev    Reverts (cancelling the whole redemption) if the heartbeat is missing, stale, future-dated,
     *         or not signed by the delegator's registered signer. Read-only: safe in `view`.
     * @param _terms  HeartbeatLib-encoded TTL (32 bytes, uint256 seconds).
     * @param _args   HeartbeatLib-encoded freshness proof: (uint64 issuedAt, bytes signature).
     * @param _mode   Execution mode; must be default exec type.
     * @param _delegator The delegator whose freshness is being checked.
     */
    function beforeHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata,
        bytes32,
        address _delegator,
        address
    )
        public
        view
        override
        onlyDefaultExecutionMode(_mode)
    {
        uint256 ttl_ = getTermsInfo(_terms);
        (uint64 issuedAt_, bytes memory signature_) = abi.decode(_args, (uint64, bytes));

        address expected_ = signerOf[_delegator];
        if (expected_ == address(0)) revert NoHeartbeatSigner(_delegator);

        // Freshness: the proof must not be older than `ttl`, and not dated meaningfully in the future.
        if (block.timestamp > uint256(issuedAt_) + ttl_) revert StaleHeartbeat(issuedAt_, ttl_, block.timestamp);
        if (uint256(issuedAt_) > block.timestamp + MAX_CLOCK_SKEW) revert FutureHeartbeat(issuedAt_, block.timestamp);

        // Authenticity: recovered signer must be the delegator's registered heartbeat signer.
        bytes32 digest_ = _hashTypedDataV4(_delegator.structHash(issuedAt_));
        address recovered_ = ECDSA.recover(digest_, signature_);
        if (recovered_ != expected_) revert BadHeartbeatSigner(expected_, recovered_);
    }

    /**
     * @notice Decode the caveat terms (the freshness TTL in seconds).
     * @param _terms 32-byte word holding a uint256 TTL.
     */
    function getTermsInfo(bytes calldata _terms) public pure returns (uint256 ttlSeconds_) {
        if (_terms.length != 32) revert InvalidTermsLength(_terms.length);
        ttlSeconds_ = uint256(bytes32(_terms));
    }

    /**
     * @notice The EIP-712 digest an off-chain signer must sign for `_delegator` at `_issuedAt`.
     * @dev    Exposed so the SDK / tests can build identical digests; uses the cached domain
     *         separator (name "RevGuardHeartbeat", version "1", this chain, this contract).
     */
    function heartbeatDigest(address _delegator, uint64 _issuedAt) external view returns (bytes32) {
        return _hashTypedDataV4(HeartbeatLib.structHash(_delegator, _issuedAt));
    }

    /// @notice Expose the EIP-712 domain separator for SDK parity.
    function domainSeparatorV4() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
