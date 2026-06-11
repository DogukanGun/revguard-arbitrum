"use client";

import { Button } from "./ui";
import type { Phase } from "@/lib/useRevGuard";

export function ActionPanel({
  phase,
  busy,
  hbActive,
  ready,
  actions,
}: {
  phase: Phase;
  busy: boolean;
  hbActive: boolean;
  ready: boolean; // connected + correct chain + configured
  actions: {
    initialize: () => void;
    redeem: () => void;
    revokeOnchain: () => void;
    revokeSilence: () => void;
    reset: () => void;
  };
}) {
  const live = phase === "ready" || phase === "blocked";

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Button
        variant="primary"
        className="col-span-2"
        disabled={!ready || busy || phase !== "idle"}
        onClick={actions.initialize}
      >
        {phase === "initializing" ? "Initializing…" : "Initialize demo chain"}
      </Button>

      <Button variant="primary" disabled={!live || busy} onClick={actions.redeem}>
        Redeem (agent acts)
      </Button>
      <Button variant="ghost" disabled={phase === "idle" || busy} onClick={actions.reset}>
        Reset
      </Button>

      <Button variant="danger" disabled={!live || busy} onClick={actions.revokeOnchain}>
        Revoke · bumpNonce
      </Button>
      <Button variant="warn" disabled={!live || busy || !hbActive} onClick={actions.revokeSilence}>
        Revoke · silence
      </Button>

      {!ready && (
        <p className="col-span-2 text-[11px] text-faint">
          Connect a wallet on Arbitrum Sepolia (with a deployed RevGuard) to enable actions.
        </p>
      )}
    </div>
  );
}
