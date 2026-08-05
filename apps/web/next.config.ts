import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const publicAssetUrl = process.env.NEXT_PUBLIC_ASSET_URL
  ? new URL(process.env.NEXT_PUBLIC_ASSET_URL)
  : null;

const nextConfig: NextConfig = {
  transpilePackages: ["@OpenDiagram/harness"],
  async redirects() {
    return [
      {
        source: "/ai-diagram-generator",
        destination: "/ai-architecture-diagram-generator",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // Serve the Umami tracker and its collector from our own origin. Blocklists
      // match on the `cloud.umami.is` hostname, so the direct snippet loses every
      // uBlock/Brave visitor. The tracker derives its host from its own src, so
      // the wildcard has to cover /stats/api/send too, not just /stats/script.js.
      // https://umami.is/docs/bypass-ad-blockers
      {
        source: "/stats/:match*",
        destination: "https://cloud.umami.is/:match*",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "framerusercontent.com",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/u/**",
      },
      ...(publicAssetUrl
        ? [
            {
              protocol: publicAssetUrl.protocol.replace(":", "") as "http" | "https",
              hostname: publicAssetUrl.hostname,
              port: publicAssetUrl.port,
              pathname: `${publicAssetUrl.pathname.replace(/\/$/, "")}/public/**`,
            },
          ]
        : []),
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "opendiagram",
  project: "web",
  // Source map upload (readable stack traces). Skipped when the token is absent.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Proxy Sentry requests through our own origin to dodge ad-blockers.
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
