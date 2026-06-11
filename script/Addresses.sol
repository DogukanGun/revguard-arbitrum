// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Addresses
 * @notice Canonical MetaMask Delegation Framework v1.3.0 deployment addresses.
 * @dev    Deployed via CREATE2 (salt "GATOR") at the SAME address on every supported chain,
 *         including Arbitrum Sepolia (421614) and Arbitrum One (42161). RevGuard reuses these
 *         audited, live contracts for layers (a) and (b); only HeartbeatEnforcer (layer c) is new.
 *         Verified live on Arbitrum Sepolia via `cast code` (see README "Pre-flight").
 */
library Addresses {
    /// @notice Full-chain re-validation at redemption — RevGuard layer (a).
    address internal constant DELEGATION_MANAGER = 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3;

    /// @notice Hard TTL caveat — RevGuard layer (b)-i.
    address internal constant TIMESTAMP_ENFORCER = 0x1046bb45C8d673d4ea75321280DB34899413c069;

    /// @notice Per-delegator nonce for O(1) bulk revocation (`incrementNonce`) — RevGuard layer (b)-ii.
    address internal constant NONCE_ENFORCER = 0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f;

    /// @notice Smart-account factory (used only for the stretch DeleGator-account path).
    address internal constant SIMPLE_FACTORY = 0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c;

    /// @notice Hybrid (EOA+passkey) DeleGator implementation (stretch).
    address internal constant HYBRID_DELEGATOR_IMPL = 0x48dBe696A4D990079e039489bA2053B36E8FFEC4;
}
