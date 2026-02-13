import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/api/**": ["../../db/observatory.sqlite"],
    "/": ["../../db/observatory.sqlite"],
    "/vendors": ["../../db/observatory.sqlite"],
    "/platforms": ["../../db/observatory.sqlite"],
    "/sessions/**": ["../../db/observatory.sqlite"],
    "/actions": ["../../db/observatory.sqlite"],
  },
};

export default nextConfig;
