import type { NextConfig } from "next";

// Cache Components (cacheComponents / partialPrefetching) is deliberately off.
// Every page and route here is per-user and dynamic, and with it on any server
// component that reads cookies or the clock must sit inside <Suspense> or the
// build fails. See .10x/decisions.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
