import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is its own workspace root (avoids picking up parent lockfiles).
  outputFileTracingRoot: __dirname,
  // The @revguard/sdk ships as TypeScript source (ESM with .js import specifiers).
  transpilePackages: ["@revguard/sdk"],
  webpack: (config) => {
    // Resolve the SDK's `./foo.js` specifiers to the actual `.ts` sources.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    // Optional deps pulled by @wagmi/connectors' (unused) walletConnect path.
    config.resolve.fallback = { ...config.resolve.fallback, "pino-pretty": false };
    return config;
  },
};

export default nextConfig;
