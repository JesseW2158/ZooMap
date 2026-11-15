import type { NextConfig } from "next";

// Cache Components (cacheComponents / partialPrefetching) is deliberately off.
// Every page and route here is per-user and dynamic, and with it on any server
// component that reads cookies or the clock must sit inside <Suspense> or the
// build fails. See .10x/decisions.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev-only "N" badge sat on top of a tab button in every corner (search, bell and
  // account, Activities, Ask). Runtime errors still open Next's error overlay.
  devIndicators: false,
};

export default nextConfig;
