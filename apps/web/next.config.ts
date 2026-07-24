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

export default nextConfig;
