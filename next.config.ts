import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://telegram.org`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://nft.fragment.com https://t.me https://*.t.me",
      `connect-src 'self' https://api.binance.com https://www.okx.com https://giftasset.pro https://api.changes.tg${isDev ? " ws://localhost:*" : ""}`,
      "frame-src https://oauth.telegram.org",
      "font-src 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ws"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/ws/**/*"],
  },
  images: {
    remotePatterns: [{ hostname: "nft.fragment.com" }],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
