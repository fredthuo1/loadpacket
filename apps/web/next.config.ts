import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep browser-test builds separate from a developer's running Next server.
  distDir: process.env.LOADPACKET_AUTH_TEST === '1' ? '.next-auth-test' : '.next',
};

export default nextConfig;
