"use client";

import { useNow } from "@/lib/useNow";
import type { RaceMarks } from "@/lib/useRevGuard";
import { cn } from "@/lib/cn";

/** Defender-vs-attacker: the instant of revocation vs the instant the agent is denied. Gap ≤ bound. */
export function RaceTimeline({ race, boundS }: { race: RaceMarks; boundS: bigint | null }) {
  const counting = Boolean(race.revokedAt && !race.enforcedAt);
  const now = useNow(counting);
  const boundMs = race.boundMs ?? Number(boundS ?? 39n) * 1000;

  if (!race.revokedAt) {
    return (
      <p className="text-[11px] text-faint">
        Revoke to start the race — the bar shows how long authority survives versus the {Number(boundS ?? 39n)}s bound.
      </p>
    );
  }

  const elapsed = (race.enforcedAt ?? now) - race.revokedAt;
  const frac = Math.min(1, elapsed / boundMs);
  const enforced = Boolean(race.enforcedAt);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-7 rounded-md border border-border bg-bg/60">
        {/* bound reference fill */}
        <div
          className={cn("absolute inset-y-0 left-0 rounded-md transition-[width] duration-200")}
          style={{
            width: `${frac * 100}%`,
            background: enforced ? "rgba(52,211,153,0.18)" : "rgba(251,113,133,0.18)",
          }}
        />
        {/* revoke marker */}
        <Marker pos={0} color="var(--color-danger)" label="revoke" />
        {/* enforced / now marker */}
        <Marker
          pos={frac}
          color={enforced ? "var(--color-valid)" : "var(--color-warn)"}
          label={enforced ? "blocked" : "now"}
        />
        {/* bound end */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-faint mono">
          {Number(boundS ?? 39n)}s
        </div>
      </div>
      <div className="mono text-[11px]">
        {enforced ? (
          <span className="text-valid">
            enforced in {(elapsed / 1000).toFixed(1)}s ≤ {Number(boundS ?? 39n)}s bound — 0 bound violations
          </span>
        ) : (
          <span className="text-warn">authority surviving {(elapsed / 1000).toFixed(1)}s…</span>
        )}
      </div>
    </div>
  );
}

function Marker({ pos, color, label }: { pos: number; color: string; label: string }) {
  return (
    <div className="absolute top-0 h-full" style={{ left: `calc(${Math.min(1, pos) * 100}% - 1px)` }}>
      <div className="h-full w-[2px]" style={{ background: color }} />
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px]" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
