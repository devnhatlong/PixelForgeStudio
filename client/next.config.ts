import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a verification build (e.g. `npm run build:check`) write elsewhere,
  // so it never overwrites the files of a running `npm run dev` (shared .next → "Cannot find module ./vendor-chunks/...").
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
