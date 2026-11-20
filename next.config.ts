import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
