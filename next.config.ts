import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // This repository lives below another lockfile. Without an explicit root,
  // Turbopack can select the parent workspace and generate mismatched manifests.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
