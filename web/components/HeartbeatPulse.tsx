"use client";

import { motion } from "framer-motion";
import { useNow } from "@/lib/useNow";
import { Badge, Dot } from "./ui";

/** Layer (c) visual: the off-chain heartbeat. Fresh = pulsing emerald; silenced = the proof ages to red. */
export function HeartbeatPulse({
  active,
  issuedAt,
  ttl,
}: {
  active: boolean;
  issuedAt: bigint | null;
  ttl: number;
}) {
  const now = useNow(true, 250);
  const nowS = Math.floor(now / 1000);
  const age = issuedAt != null ? Math.max(0, nowS - Number(issuedAt)) : null;
  const fresh = active && age != null && age <= ttl;
  const frac = age != null ? Math.min(1, age / ttl) : 0;

  const tone = fresh ? "valid" : age != null && age > ttl ? "danger" : "warn";
  const barColor = fresh ? "var(--color-valid)" : age != null && age > ttl ? "var(--color-danger)" : "var(--color-warn)";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dot tone={tone} pulse={fresh} />
          <span className="text-sm font-medium">
            {fresh ? "Fresh" : active ? "Aging" : "Silenced"}
          </span>
        </div>
        <Badge tone={tone}>
          {age != null ? <span className="mono">{age}s / {ttl}s</span> : "no proof"}
        </Badge>
      </div>

      {/* EKG-ish pulse line */}
      <div className="relative h-9 overflow-hidden rounded-md border border-border bg-bg/60">
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 flex items-center"
          animate={fresh ? { x: ["-20%", "120%"] } : { x: "0%" }}
          transition={fresh ? { duration: 1.6, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        >
          {fresh && (
            <svg width="90" height="36" viewBox="0 0 90 36" fill="none">
              <path
                d="M0 18 H30 L36 6 L44 30 L52 18 H90"
                stroke="var(--color-valid)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </motion.div>
        {!fresh && (
          <div className="absolute inset-0 flex items-center">
            <div className="h-[2px] w-full" style={{ background: barColor, opacity: 0.5 }} />
          </div>
        )}
      </div>

      {/* freshness budget bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full transition-[width,background] duration-300"
          style={{ width: `${(1 - frac) * 100}%`, background: barColor }}
        />
      </div>
      <p className="text-[11px] text-faint">
        Revoke-by-silence: stop signing and the freshest proof expires within the TTL — no transaction, even
        under censorship.
      </p>
    </div>
  );
}
