import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // core/*.md を読むために、ビルド時に含める
  outputFileTracingIncludes: { "/api/tailor": ["../core/**"] },
};

export default nextConfig;
