"use client";

import { useEffect, useState } from "react";

/** A ticking clock (ms epoch). Pass active=false to freeze it. */
export function useNow(active = true, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}
