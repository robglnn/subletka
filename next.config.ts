import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  rewrites: async () => [{ source: "/:key([0-9a-f]{32})\\.txt", destination: "/api/indexnow-key/:key" }],
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
