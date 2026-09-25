import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const publicAssetUrl = process.env.NEXT_PUBLIC_ASSET_URL
  ? new URL(process.env.NEXT_PUBLIC_ASSET_URL)
  : null;

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@OpenDiagram/harness"],
  // PostHog ingestion paths end in `/` (`/e/`); the default redirect strips it and drops events.
  // https://github.com/posthog/posthog.com/blob/02399e0e2ee8dcb50a0eb3a6bd22f7008b1bed7a/contents/docs/advanced/proxy/nextjs.mdx
  skipTrailingSlashRedirect: Boolean(posthogHost),
  async rewrites() {
    if (!posthogHost) return [];
    const assetsHost = posthogHost.replace(".i.posthog.com", "-assets.i.posthog.com");
    return [
      { source: "/relay/static/:path*", destination: `${assetsHost}/static/:path*` },
      { source: "/relay/array/:path*", destination: `${assetsHost}/array/:path*` },
      { source: "/relay/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  async redirects() {
    return [
      {
        source: "/ai-diagram-generator",
        destination: "/ai-architecture-diagram-generator",
        permanent: true,
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
