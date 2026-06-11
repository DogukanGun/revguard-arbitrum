/**
 * @revguard/sdk — bounded revocation for ERC-7710 agent delegation chains on Arbitrum.
 *
 * Layers (a) full-chain re-validation and (b) hard TTL + bulk nonce revocation come from the deployed
 * MetaMask Delegation Framework; this SDK adds the developer surface for layer (c) — the EIP-712
 * heartbeat freshness channel — plus chain building, redemption, revocation, and the read-only lens.
 */
export * from "./addresses.js";
export * from "./caveats.js";
export * from "./heartbeat.js";
export * from "./delegation.js";
export * from "./client.js";
