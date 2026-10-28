import type { NextConfig } from 'next';
import path from 'node:path';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // No .env file: the environment is provided by the platform.
}

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Everything the app loads comes from its own origin. Inline scripts and styles stay allowed:
 * Next.js and the theme switch inline their bootstrap scripts, and charts set inline styles.
 * Nonces would remove that, at the cost of rendering every page per request. XSS defence
 * rests on React's output encoding; this policy adds a second line (no third-party scripts,
 * no exfiltration through fetch, no plugins, no <base> hijacking, no framing).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Sign-up, reset and invitation links carry tokens in the URL: never send it to other sites.
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Docker image runs a self-contained server with only the files it needs. Off by default
  // because `next start` (local runs, e2e) does not serve the standalone output.
  ...(process.env.BUILD_STANDALONE === 'true' && {
    output: 'standalone',
    outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  }),
  headers() {
    // Pages only: the API sets its own headers (Helmet) on the responses proxied below.
    return Promise.resolve([{ source: '/((?!api/).*)', headers: securityHeaders }]);
  },
  // The browser only ever talks to this origin. Forwarding /api/v1 keeps the session cookies
  // first-party and removes CORS from the browser path entirely (see ADR 0004). The destination
  // is fixed at build time, so the Docker image takes API_URL as a build argument.
  rewrites() {
    return Promise.resolve([{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]);
  },
};

export default nextConfig;
