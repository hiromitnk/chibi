import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // core/*.md を API の実行時に読むので、ビルド成果物に含める
  outputFileTracingIncludes: { "/api/tailor": ["./core/**"] },
};

export default nextConfig;
