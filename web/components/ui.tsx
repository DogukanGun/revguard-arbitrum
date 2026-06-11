import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  title,
  hint,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  hint?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-panel/70 backdrop-blur-sm",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]",
        className,
      )}
    >
      {title && (
        <header className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{title}</h2>
          {hint && <div className="text-[11px] text-faint">{hint}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Variant = "primary" | "danger" | "warn" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand/15 text-brand border-brand/40 hover:bg-brand/25",
  danger: "bg-danger/15 text-danger border-danger/40 hover:bg-danger/25",
  warn: "bg-warn/10 text-warn border-warn/40 hover:bg-warn/20",
  ghost: "bg-transparent text-muted border-border hover:bg-panel-2 hover:text-text",
};

export function Button({
  variant = "ghost",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

type Tone = "valid" | "danger" | "warn" | "brand" | "muted";

const TONES: Record<Tone, string> = {
  valid: "text-valid border-valid/40 bg-valid/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  brand: "text-brand border-brand/40 bg-brand/10",
  muted: "text-muted border-border bg-panel-2",
};

export function Badge({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "muted", pulse }: { tone?: Tone; pulse?: boolean }) {
  const color: Record<Tone, string> = {
    valid: "bg-valid",
    danger: "bg-danger",
    warn: "bg-warn",
    brand: "bg-brand",
    muted: "bg-faint",
  };
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color[tone])} />}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color[tone])} />
    </span>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-faint">{label}</span>
      <span className="mono text-sm text-text">{children}</span>
    </div>
  );
}
