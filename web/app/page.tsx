"use client";

import { useAccount, useChainId } from "wagmi";
import { useRevGuard } from "@/lib/useRevGuard";
import { deployment, isConfigured } from "@/lib/deployment";
import { hop1, hop2 } from "@/lib/demoActors";
import { CHAIN_ID } from "@/lib/wagmi";
import { addrUrl, short } from "@/lib/format";
import { Badge, Card, Dot, Stat } from "@/components/ui";
import { ConnectButton } from "@/components/ConnectButton";
import { ChainGraph, type ChainNode } from "@/components/ChainGraph";
import { WindowRing } from "@/components/WindowRing";
import { HeartbeatPulse } from "@/components/HeartbeatPulse";
import { ActionPanel } from "@/components/ActionPanel";
import { RaceTimeline } from "@/components/RaceTimeline";
import { EventLog } from "@/components/EventLog";
import { LayersLegend } from "@/components/LayersLegend";

const HB_TTL = 39;

export default function Page() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const rg = useRevGuard();

  const configured = isConfigured();
  const ready = isConnected && chainId === CHAIN_ID && configured;

  const graphStatus: "idle" | "valid" | "blocked" = !rg.chain
    ? "idle"
    : rg.preview && !rg.preview.ok
      ? "blocked"
      : "valid";

  const nodes: ChainNode[] = [
    { label: "Root", sub: "authority · smart acct", address: deployment.demoRoot },
    { label: "Hop 1", sub: "sub-agent", address: hop1.address },
    { label: "Hop 2", sub: "sub-agent", address: hop2.address },
    { label: "Agent", sub: "redeemer", address: address ?? undefined },
  ];

  const agentBadge =
    graphStatus === "blocked" ? (
      <Badge tone="danger">
        <Dot tone="danger" /> BLOCKED
      </Badge>
    ) : graphStatus === "valid" ? (
      <Badge tone="valid">
        <Dot tone="valid" pulse /> ACTING
      </Badge>
    ) : (
      <Badge tone="muted">IDLE</Badge>
    );

  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col gap-4 px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Rev<span className="text-brand">Guard</span>
            <span className="ml-2 text-sm font-normal text-muted">
              bounded revocation for agent delegation chains
            </span>
          </h1>
          <p className="mt-0.5 text-[12px] text-faint">
            Multi-hop ERC-7710 on Arbitrum Sepolia · built on the MetaMask Delegation Framework
          </p>
        </div>
        <ConnectButton />
      </header>

      {!configured && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 px-4 py-2.5 text-[12px] text-warn">
          No deployment detected. Run <span className="mono">forge script DeployRevGuard</span> on Arbitrum
          Sepolia, then copy <span className="mono">deployments/421614.json</span> →{" "}
          <span className="mono">web/lib/deployment.json</span>. The dashboard reads live state — it never
          deploys anything.
        </div>
      )}

      <Card title="Delegation chain" hint={agentBadge}>
        <ChainGraph nodes={nodes} status={graphStatus} reason={rg.preview?.reason} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card title="Revocation window" className="lg:col-span-4">
          <div className="flex flex-col items-center gap-3">
            <WindowRing boundS={rg.boundS} race={rg.race} />
            <div className="grid w-full grid-cols-3 gap-2 border-t border-border/60 pt-3">
              <Stat label="Bound">{rg.boundS != null ? `${Number(rg.boundS)}s` : "—"}</Stat>
              <Stat label="Counter">{Number(rg.counter)}</Stat>
              <Stat label="Status">{rg.preview ? rg.preview.reason : "—"}</Stat>
            </div>
            <div className="w-full">
              <RaceTimeline race={rg.race} boundS={rg.boundS} />
            </div>
          </div>
        </Card>

        <Card title="Heartbeat — layer (c)" className="lg:col-span-4">
          <HeartbeatPulse active={rg.hbActive} issuedAt={rg.hbIssuedAt} ttl={HB_TTL} />
        </Card>

        <Card title="Controls" className="lg:col-span-4">
          <ActionPanel phase={rg.phase} busy={rg.busy} hbActive={rg.hbActive} ready={ready} actions={rg.actions} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card title="On-chain event log" className="lg:col-span-8">
          <EventLog events={rg.events} />
        </Card>
        <Card title="Defense layers" className="lg:col-span-4">
          <LayersLegend activeReason={rg.preview && !rg.preview.ok ? rg.preview.reason : undefined} />
        </Card>
      </div>

      <footer className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-faint">
        <span>Deployed:</span>
        <AddrLink label="HeartbeatEnforcer" addr={deployment.heartbeatEnforcer} />
        <AddrLink label="RevGuardLens" addr={deployment.revGuardLens} />
        <AddrLink label="DelegationManager" addr={deployment.delegationManager} />
        <AddrLink label="demoRoot" addr={deployment.demoRoot} />
      </footer>
    </main>
  );
}

function AddrLink({ label, addr }: { label: string; addr: string }) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return (
    <a href={addrUrl(addr)} target="_blank" rel="noreferrer" className="hover:text-brand">
      {label} <span className="mono text-muted">{short(addr)}</span> ↗
    </a>
  );
}
