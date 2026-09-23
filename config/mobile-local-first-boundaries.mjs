export const mobileLocalFirstBoundaries = Object.freeze({
  sourceRoots: [
    "apps/mobile",
    "packages/contracts",
    "packages/domain",
    "packages/ui",
    "packages/api-client",
    "packages/mobile-data",
    "packages/sync-engine",
  ],
  extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"],
  forbiddenImports: [
    "next/headers",
    "next/server",
    "server-only",
    "@opennextjs/cloudflare",
    "cloudflare:workers",
    "@/app/api",
    "@/app/admin",
    "@/components/admin",
    "@/lib/admin",
    "@/lib/data/d1",
  ],
  forbiddenPatterns: [
    { name: "Cloudflare runtime binding", source: "\\bgetCloudflareContext\\b" },
    { name: "server secret access", source: "process\\.env\\.(?:AUTH_SECRET|GOOGLE_CLIENT_SECRET|LINKEDIN_CLIENT_SECRET|RAZORPAY_KEY_SECRET|CF_API_TOKEN)\\b" },
  ],
});
