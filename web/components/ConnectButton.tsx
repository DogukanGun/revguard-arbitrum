"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { Button, Badge, Dot } from "./ui";
import { short } from "@/lib/format";
import { CHAIN_ID } from "@/lib/wagmi";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const injected = connectors[0];

  if (!isConnected) {
    return (
      <Button variant="primary" disabled={isPending || !injected} onClick={() => injected && connect({ connector: injected })}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  if (chainId !== CHAIN_ID) {
    return (
      <Button variant="warn" onClick={() => switchChain({ chainId: CHAIN_ID })}>
        Switch to Arbitrum Sepolia
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge tone="brand">
        <Dot tone="brand" pulse /> <span className="mono">{short(address)}</span>
      </Badge>
      <Button variant="ghost" onClick={() => disconnect()}>
        Disconnect
      </Button>
    </div>
  );
}
