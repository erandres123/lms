import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every screen is a client component talking to the API, so the portal is a
  // static site: no Node server is needed to host it.
  output: 'export',
};

export default nextConfig;
