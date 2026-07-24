import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@OpenDiagram/harness"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "framerusercontent.com",
        pathname: "/images/**",
      },
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
