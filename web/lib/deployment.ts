import { zeroAddress, type Address } from "viem";
import type { RevGuardDeployment } from "@revguard/sdk";
import raw from "./deployment.json";

/**
 * Deployed RevGuard addresses. After running `forge script DeployRevGuard` on Arbitrum Sepolia, copy
 * `deployments/421614.json` over `web/lib/deployment.json` (the four RevGuard-authored addresses fill in).
 * The framework addresses are canonical and already populated.
 */
export const deployment = raw as RevGuardDeployment;

/** True once the RevGuard-authored contracts + demo fixtures have real addresses. */
export function isConfigured(): boolean {
  const required: Address[] = [
    deployment.heartbeatEnforcer,
    deployment.revGuardLens,
    deployment.demoRoot,
    deployment.demoCounter,
  ];
  return required.every((a) => a && a.toLowerCase() !== zeroAddress);
}

export const HARD_TTL = 3600n; // TimestampEnforcer horizon (s)
export const HB_TTL = 39n; // HeartbeatEnforcer freshness horizon (s)
export const HEARTBEAT_CADENCE_MS = 5000;
