import type { NextConfig } from "next";

// Deploy as standard Next.js on Vercel (no static export). Vercel auto-detects
// the framework and uses .next/ as the output. The dashboard is client-rendered
// throughout (every component using wagmi hooks is "use client"), so SSR adds
// zero runtime overhead — and skipping static export sidesteps the routes-manifest
// conflict between `output: "export"` and Vercel's Next.js framework handler.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;
