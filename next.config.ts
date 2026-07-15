import type { NextConfig } from "next";

// basePath is only needed for GitHub Pages (which serves under
// /QUEstimator/). In local dev, the bare / path is more convenient
// and matches the sandbox preview's expectations.
const isProd = process.env.NODE_ENV === "production";
const GITHUB_BASE_PATH = "/QUEstimator";

const nextConfig: NextConfig = {
  // Static export for GitHub Pages hosting.
  output: "export",
  // GitHub Pages serves under /QUEstimator/, so every page URL ends with /.
  // trailingSlash makes relative asset/data paths resolve correctly.
  trailingSlash: true,
  // GitHub Pages has no image optimization server.
  images: { unoptimized: true },
  // Only apply basePath/assetPrefix in production builds (for GitHub Pages).
  // Dev server serves at bare / for convenience.
  ...(isProd
    ? { basePath: GITHUB_BASE_PATH, assetPrefix: GITHUB_BASE_PATH + "/" }
    : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
