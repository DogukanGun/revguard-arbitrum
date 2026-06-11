"use client";

import { cn } from "@/lib/cn";

const LAYERS = [
  {
    id: "a",
    title: "Full-chain re-validation",
    body: "Every redemption re-checks every ancestor. Disabling the root collapses the whole subtree in O(1).",
    reasons: ["DISABLED"],
    reused: "DelegationManager",
  },
  {
    id: "b",
    title: "Hard TTL + bulk nonce",
    body: "One bumpNonce invalidates all of a delegator's outstanding delegations; the TTL is a coarse backstop.",
    reasons: ["NONCE_REVOKED", "TTL_EXPIRED", "TTL_NOT_STARTED"],
    reused: "Timestamp + Nonce enforcers",
  },
  {
    id: "c",
    title: "Heartbeat freshness (novel)",
    body: "A fresh EIP-712 heartbeat is required. Stop signing and authority expires passively — even under censorship.",
    reasons: ["HEARTBEAT_STALE", "HEARTBEAT_NO_SIGNER"],
    reused: "HeartbeatEnforcer",
  },
] as const;

export function LayersLegend({ activeReason }: { activeReason?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {LAYERS.map((l) => {
        const active = activeReason ? l.reasons.includes(activeReason as never) : false;
        return (
          <div
            key={l.id}
            className={cn(
              "rounded-lg border px-3 py-2 transition-colors",
              active ? "border-danger/50 bg-danger/5" : "border-border bg-panel-2/40",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-4 w-4 place-items-center rounded text-[10px] font-bold",
                    active ? "bg-danger/20 text-danger" : "bg-border text-muted",
                  )}
                >
                  {l.id}
                </span>
                <span className={cn("text-xs font-medium", active ? "text-danger" : "text-text")}>{l.title}</span>
              </div>
              <span className="text-[9px] uppercase tracking-wider text-faint">{l.reused}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">{l.body}</p>
          </div>
        );
      })}
    </div>
  );
}
