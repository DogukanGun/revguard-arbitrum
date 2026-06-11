"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig, usePublicClient } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import type { Address, Hex } from "viem";
import {
  HeartbeatService,
  attachHeartbeat,
  buildSignedChain,
  counterValue,
  currentNonce,
  encodeSingleExecution,
  heartbeatCaveat,
  incrementCalldata,
  nonceCaveat,
  previewChain,
  redeem as sdkRedeem,
  registerSignerViaAccount,
  revokeViaAccount,
  timestampCaveat,
  windowBound,
  type Delegation,
} from "@revguard/sdk";
import { deployment, HARD_TTL, HB_TTL, HEARTBEAT_CADENCE_MS } from "./deployment";
import { hbSigner, hop1, hop2, rootOwner } from "./demoActors";
import { CHAIN_ID } from "./wagmi";

export type Phase = "idle" | "initializing" | "ready" | "working" | "blocked";

export interface LogEntry {
  id: number;
  kind: "info" | "ok" | "danger" | "warn";
  message: string;
  tx?: Hex;
}

export interface RaceMarks {
  revokedAt?: number; // ms epoch when revocation was issued
  enforcedAt?: number; // ms epoch when the agent first became blocked
  boundMs?: number; // the promised bound, in ms
}

export interface Preview {
  ok: boolean;
  failingIndex: number;
  reason: string;
}

export function useRevGuard() {
  const publicClient = usePublicClient();
  const config = useConfig();

  const [phase, setPhase] = useState<Phase>("idle");
  const [chain, setChain] = useState<Delegation[] | null>(null);
  const [notAfter, setNotAfter] = useState<bigint>(0n);
  const [hbIssuedAt, setHbIssuedAt] = useState<bigint | null>(null);
  const [hbActive, setHbActive] = useState(false);
  const [boundS, setBoundS] = useState<bigint | null>(null);
  const [counter, setCounter] = useState<bigint>(0n);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [race, setRace] = useState<RaceMarks>({});
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const serviceRef = useRef<HeartbeatService | null>(null);
  const logId = useRef(0);

  const log = useCallback((kind: LogEntry["kind"], message: string, tx?: Hex) => {
    setEvents((e) => [{ id: ++logId.current, kind, message, tx }, ...e].slice(0, 40));
  }, []);

  // Resolve a usable wallet client on demand. `useWalletClient()` can be transiently undefined under
  // wagmi's ssr hydration even while connected, which would make actions silently no-op; fetching it
  // imperatively at click time (and logging on failure) avoids that dead-end.
  const requireWallet = useCallback(async () => {
    const wc = await getWalletClient(config, { chainId: CHAIN_ID }).catch(() => null);
    if (!wc?.account) {
      log("danger", "No wallet available. Unlock MetaMask and make sure it's on Arbitrum Sepolia, then retry.");
      return null;
    }
    return wc;
  }, [config, log]);

  // -------- initialize: build + sign the chain, register signer, start heartbeat --------
  const initialize = useCallback(async () => {
    if (!publicClient) return;
    const walletClient = await requireWallet();
    if (!walletClient) return;
    setBusy(true);
    setPhase("initializing");
    try {
      const agent = walletClient.account.address as Address;
      const root = deployment.demoRoot;
      const now = BigInt(Math.floor(Date.now() / 1000));
      const na = now + HARD_TTL;
      setNotAfter(na);

      const nonce = await currentNonce(publicClient, deployment.nonceEnforcer, deployment.delegationManager, root);
      const rootCaveats = [
        timestampCaveat(na),
        nonceCaveat(nonce),
        heartbeatCaveat(deployment.heartbeatEnforcer, HB_TTL),
      ];

      log("info", "Building + signing depth-3 chain (root → hop1 → hop2 → you)…");
      const built = await buildSignedChain(publicClient, deployment.delegationManager, CHAIN_ID, {
        rootAccount: root,
        rootOwner,
        hops: [hop1, hop2],
        agent,
        rootCaveats,
      });
      setChain(built);

      log("info", "Registering heartbeat signer via the root account…");
      const tx = await registerSignerViaAccount(
        walletClient,
        walletClient.account,
        root,
        deployment.heartbeatEnforcer,
        hbSigner.address,
      );
      log("ok", "Heartbeat signer registered.", tx);

      // Start the in-browser heartbeat service (layer c).
      const service = new HeartbeatService(hbSigner, CHAIN_ID, deployment.heartbeatEnforcer, HEARTBEAT_CADENCE_MS);
      await service.start(root);
      serviceRef.current = service;
      setHbActive(true);
      setHbIssuedAt(service.latest(root)?.issuedAt ?? null);

      setPhase("ready");
      log("ok", "Chain live. Heartbeats flowing. Agent can act.");
    } catch (e) {
      log("danger", `Initialize failed: ${errMsg(e)}`);
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }, [publicClient, requireWallet, log]);

  // -------- redeem: agent acts through the chain --------
  const redeem = useCallback(async () => {
    if (!publicClient || !chain) return;
    const walletClient = await requireWallet();
    if (!walletClient) return;
    setBusy(true);
    setPhase("working");
    try {
      const root = deployment.demoRoot;
      const proof = serviceRef.current?.latest(root);
      if (!proof) throw new Error("no fresh heartbeat (service stopped)");
      attachHeartbeat(chain, proof);
      const exec = encodeSingleExecution(deployment.demoCounter, 0n, incrementCalldata());
      log("info", "Agent redeeming the chain…");
      const tx = await sdkRedeem(walletClient, walletClient.account, deployment.delegationManager, chain, exec);
      log("ok", "Redeemed — agent executed on-chain.", tx);
      await refresh();
      setPhase("ready");
    } catch (e) {
      log("danger", `Redeem reverted: ${errMsg(e)}`);
      setPhase(preview && !preview.ok ? "blocked" : "ready");
    } finally {
      setBusy(false);
    }
  }, [publicClient, requireWallet, chain, log, preview]);

  // -------- revoke (on-chain bumpNonce) --------
  const revokeOnchain = useCallback(async () => {
    const walletClient = await requireWallet();
    if (!walletClient) return;
    setBusy(true);
    setPhase("working");
    try {
      setRace((r) => ({ ...r, revokedAt: Date.now(), boundMs: Number(boundS ?? HB_TTL) * 1000 }));
      log("warn", "Revoking on-chain: bumpNonce (invalidates the whole subtree)…");
      const tx = await revokeViaAccount(
        walletClient,
        walletClient.account,
        deployment.demoRoot,
        deployment.nonceEnforcer,
        deployment.delegationManager,
      );
      log("danger", "Revoked on-chain. Authority bumped.", tx);
      await refresh();
    } catch (e) {
      log("danger", `Revoke failed: ${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  }, [requireWallet, boundS, log]);

  // -------- revoke (by silence: stop heartbeats) --------
  const revokeSilence = useCallback(() => {
    const root = deployment.demoRoot;
    serviceRef.current?.revoke(root);
    setHbActive(false);
    setRace((r) => ({ ...r, revokedAt: Date.now(), boundMs: Number(boundS ?? HB_TTL) * 1000 }));
    log("warn", "Heartbeat service silenced — authority will expire passively within the bound.");
  }, [boundS, log]);

  // -------- reset --------
  const reset = useCallback(() => {
    serviceRef.current?.stop();
    serviceRef.current = null;
    setChain(null);
    setHbActive(false);
    setHbIssuedAt(null);
    setBoundS(null);
    setPreview(null);
    setRace({});
    setPhase("idle");
    log("info", "Reset. Re-initialize to run again.");
  }, [log]);

  // -------- live reads (counter, windowBound, previewChain, heartbeat freshness) --------
  const refresh = useCallback(async () => {
    if (!publicClient || !chain) return;
    const root = deployment.demoRoot;
    const issuedAt = serviceRef.current?.latest(root)?.issuedAt;
    setHbIssuedAt(issuedAt ?? hbIssuedAt);
    const issuedArr = chain.map((_, i) => (i === chain.length - 1 ? (issuedAt ?? hbIssuedAt ?? 0n) : 0n));
    try {
      const [c, b, p] = await Promise.all([
        counterValue(publicClient, deployment.demoCounter),
        windowBound(publicClient, deployment.revGuardLens, notAfter, HB_TTL),
        previewChain(publicClient, deployment.revGuardLens, chain, issuedArr),
      ]);
      setCounter(c);
      setBoundS(b);
      const pv: Preview = { ok: p.ok, failingIndex: Number(p.failingIndex), reason: p.reason };
      setPreview(pv);
      if (!pv.ok) {
        setPhase("blocked");
        setRace((r) => (r.revokedAt && !r.enforcedAt ? { ...r, enforcedAt: Date.now() } : r));
      }
    } catch {
      /* transient RPC hiccup; ignore */
    }
  }, [publicClient, chain, notAfter, hbIssuedAt]);

  // poll while a chain exists
  useEffect(() => {
    if (!chain) return;
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [chain, refresh]);

  useEffect(() => () => serviceRef.current?.stop(), []);

  return {
    phase,
    chain,
    boundS,
    counter,
    preview,
    race,
    events,
    busy,
    hbActive,
    hbIssuedAt,
    notAfter,
    actions: { initialize, redeem, revokeOnchain, revokeSilence, reset },
  };
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 140 ? m.slice(0, 140) + "…" : m;
}
