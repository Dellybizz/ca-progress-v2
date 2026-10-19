import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // OpenNext does not automatically retain arbitrary GitHub Actions variables at
  // Worker runtime. Embed the non-secret build SHA so /api/app-config reports the
  // exact deployment instead of silently falling back to the Phase 0 baseline.
  env: {
    DEPLOY_SHA: process.env.DEPLOY_SHA ?? "development",
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      // Physical v1 handlers (for example bootstrap and capabilities) win first.
      // All other approved v1 paths reuse the established route/service layer.
      fallback: [{ source: "/api/v1/:path*", destination: "/api/:path*" }],
    };
  },
};

export default nextConfig;
