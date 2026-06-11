"use client";

import { AnimatePresence, motion } from "framer-motion";
import { txUrl, short } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { LogEntry } from "@/lib/useRevGuard";

const TONE: Record<LogEntry["kind"], string> = {
  info: "text-muted",
  ok: "text-valid",
  danger: "text-danger",
  warn: "text-warn",
};

export function EventLog({ events }: { events: LogEntry[] }) {
  return (
    <div className="thin-scroll flex max-h-[230px] flex-col gap-1.5 overflow-y-auto pr-1">
      {events.length === 0 && <p className="text-[11px] text-faint">No events yet.</p>}
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.div
            key={e.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-2 text-[12px] leading-snug"
          >
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
            <span className={cn("flex-1", TONE[e.kind])}>{e.message}</span>
            {e.tx && (
              <a
                href={txUrl(e.tx)}
                target="_blank"
                rel="noreferrer"
                className="mono shrink-0 text-[11px] text-brand hover:underline"
              >
                {short(e.tx)} ↗
              </a>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
