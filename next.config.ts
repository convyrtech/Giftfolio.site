import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ws"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/ws/**/*"],
  },
  images: {
    remotePatterns: [{ hostname: "nft.fragment.com" }],
  },
};

export default nextConfig;
