import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
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
