"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { Badge } from "./ui";

export interface ChainNode {
  label: string;
  sub: string;
  address?: string;
}

type Status = "idle" | "valid" | "blocked";

/**
 * The delegation chain root → hop1 → hop2 → agent. When valid, edges flow brand→valid; when the
 * root is revoked, the whole subtree collapses red (RevGuard's depth-independent property).
 */
export function ChainGraph({
  nodes,
  status,
  reason,
}: {
  nodes: ChainNode[];
  status: Status;
  reason?: string;
}) {
  const edgeColor =
    status === "blocked" ? "var(--color-danger)" : status === "valid" ? "var(--color-valid)" : "var(--color-faint)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {nodes.map((n, i) => {
          const isAgent = i === nodes.length - 1;
          const isRoot = i === 0;
          const nodeTone =
            status === "blocked"
              ? "danger"
              : isAgent && status === "valid"
                ? "valid"
                : status === "valid"
                  ? "brand"
                  : "muted";
          return (
            <div key={n.label} className="flex min-w-[132px] flex-1 items-center">
              <NodeCard node={n} tone={nodeTone} isRoot={isRoot} isAgent={isAgent} />
              {!isAgent && <Edge color={edgeColor} animate={status === "valid"} />}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-faint">
        <span>
          {status === "blocked" ? (
            <span className="text-danger">
              Subtree collapsed — disabling the root denies every downstream hop, regardless of depth.
            </span>
          ) : status === "valid" ? (
            <span className="text-valid">Authority flows root → agent. The agent can act.</span>
          ) : (
            "Initialize to build and sign the chain."
          )}
        </span>
        {status === "blocked" && reason && <Badge tone="danger">{reason}</Badge>}
      </div>
    </div>
  );
}

function NodeCard({
  node,
  tone,
  isRoot,
  isAgent,
}: {
  node: ChainNode;
  tone: "valid" | "danger" | "brand" | "muted";
  isRoot: boolean;
  isAgent: boolean;
}) {
  const ring: Record<string, string> = {
    valid: "border-valid/50 shadow-[0_0_24px_-8px_var(--color-valid)]",
    danger: "border-danger/50 shadow-[0_0_24px_-8px_var(--color-danger)]",
    brand: "border-brand/40",
    muted: "border-border",
  };
  const text: Record<string, string> = {
    valid: "text-valid",
    danger: "text-danger",
    brand: "text-brand",
    muted: "text-muted",
  };
  return (
    <motion.div
      layout
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 6 }}
      className={cn("w-full rounded-lg border bg-panel-2/80 px-3 py-2.5", ring[tone])}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold", text[tone])}>{node.label}</span>
        {isRoot && <span className="text-[9px] uppercase tracking-wider text-faint">smart acct</span>}
        {isAgent && <span className="text-[9px] uppercase tracking-wider text-faint">you</span>}
      </div>
      <div className="mt-0.5 text-[10px] text-faint">{node.sub}</div>
      {node.address && <div className="mono mt-1 text-[10px] text-muted">{short(node.address)}</div>}
    </motion.div>
  );
}

function Edge({ color, animate }: { color: string; animate: boolean }) {
  return (
    <div className="relative mx-1 h-[2px] w-8 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--color-border)" }}>
      <motion.div
        className="absolute inset-0"
        style={{ background: color }}
        initial={{ x: "-100%" }}
        animate={animate ? { x: ["-100%", "100%"] } : { x: 0 }}
        transition={animate ? { duration: 1.4, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
      />
    </div>
  );
}
