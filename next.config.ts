import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep builds scoped to this checkout when it sits inside another project.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
