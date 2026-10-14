import type { NextConfig } from 'next';
import path from 'node:path';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // No .env file: the environment is provided by the platform.
}

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The browser only ever talks to this origin. Forwarding /api/v1 keeps the session cookies
  // first-party and removes CORS from the browser path entirely (see ADR 0004).
  rewrites() {
    return Promise.resolve([{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]);
  },
};

export default nextConfig;
