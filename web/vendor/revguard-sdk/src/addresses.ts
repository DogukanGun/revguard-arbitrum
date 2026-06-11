import type { Address } from "viem";

/**
 * Canonical MetaMask Delegation Framework v1.3.0 addresses — identical on every supported chain
 * (deployed via CREATE2). RevGuard reuses these audited contracts for layers (a) and (b).
 */
export const FRAMEWORK = {
  delegationManager: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address,
  timestampEnforcer: "0x1046bb45C8d673d4ea75321280DB34899413c069" as Address,
  nonceEnforcer: "0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f" as Address,
} as const;

export const ARBITRUM_SEPOLIA = {
  id: 421614,
  rpc: "https://sepolia-rollup.arbitrum.io/rpc",
  explorer: "https://sepolia.arbiscan.io",
} as const;

/** Sentinel root authority used by the DelegationManager for top-level delegations. */
export const ROOT_AUTHORITY =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;

/** RevGuard-authored addresses are written here by `forge script DeployRevGuard` (deployments/<chainId>.json). */
export interface RevGuardDeployment {
  chainId: number;
  heartbeatEnforcer: Address;
  revGuardLens: Address;
  delegationManager: Address;
  timestampEnforcer: Address;
  nonceEnforcer: Address;
  /** Demo fixtures (for the dashboard's fully-live flow): a RevGuardAccount root + a Counter exec target. */
  demoRoot: Address;
  demoCounter: Address;
}
