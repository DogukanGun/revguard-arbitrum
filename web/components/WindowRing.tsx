"use client";

import { useNow } from "@/lib/useNow";
import type { RaceMarks } from "@/lib/useRevGuard";

const R = 54;
const C = 2 * Math.PI * R;

/**
 * The deterministic revocation window. Idle: shows the bound. After revoke: the ring depletes over the
 * bound; once the agent is denied, it locks to the MEASURED enforcement time (the gap ≤ bound).
 */
export function WindowRing({ boundS, race }: { boundS: bigint | null; race: RaceMarks }) {
  const counting = Boolean(race.revokedAt && !race.enforcedAt);
  const now = useNow(counting);

  const boundMs = race.boundMs ?? Number(boundS ?? 39n) * 1000;
  let fraction = 1;
  let centerLabel = boundS != null ? `${Number(boundS)}s` : "—";
  let topLabel = "WINDOW BOUND";
  let color = "var(--color-brand)";

  if (race.enforcedAt && race.revokedAt) {
    const gap = (race.enforcedAt - race.revokedAt) / 1000;
    fraction = 0;
    centerLabel = `${gap.toFixed(1)}s`;
    topLabel = "ENFORCED";
    color = "var(--color-valid)";
  } else if (counting && race.revokedAt) {
    const remaining = Math.max(0, race.revokedAt + boundMs - now);
    fraction = boundMs > 0 ? remaining / boundMs : 0;
    centerLabel = `${Math.ceil(remaining / 1000)}s`;
    topLabel = "CLOSING";
    color = "var(--color-danger)";
  }

  const offset = C * (1 - fraction);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
        <circle cx="74" cy="74" r={R} fill="none" stroke="var(--color-border)" strokeWidth="8" />
        <circle
          cx="74"
          cy="74"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: counting ? "none" : "stroke-dashoffset 0.5s ease, stroke 0.3s" }}
        />
      </svg>
      <div className="-mt-[104px] mb-[44px] flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-[0.16em] text-faint">{topLabel}</span>
        <span className="mono text-3xl font-semibold" style={{ color }}>
          {centerLabel}
        </span>
        {race.enforcedAt && (
          <span className="mono text-[10px] text-valid">≤ {Number(boundS ?? 39n)}s bound</span>
        )}
      </div>
    </div>
  );
}
