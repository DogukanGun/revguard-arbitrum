import { http, createConfig } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { ARBITRUM_SEPOLIA } from "@revguard/sdk";

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? ARBITRUM_SEPOLIA.rpc;

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [arbitrumSepolia.id]: http(RPC) },
  ssr: true,
});

export const CHAIN_ID = arbitrumSepolia.id; // 421614
export const EXPLORER = ARBITRUM_SEPOLIA.explorer;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
