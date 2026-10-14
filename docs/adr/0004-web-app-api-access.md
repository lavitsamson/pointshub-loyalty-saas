# ADR 0004: The web app reaches the API through a same-origin proxy

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The merchant dashboard is a Next.js app; the API is a separate NestJS service. Sessions live in
`httpOnly` cookies (ADR 0002), so how the browser reaches the API decides whether those cookies
are first-party, whether CORS is involved, and where the session gets renewed.

Options considered:

1. **Browser calls the API origin directly** (`api.example.com`). Cookies become third-party
   unless both apps share a registrable domain, every call needs a CORS preflight, and local
   development (two ports) behaves differently from production.
2. **Backend-for-frontend:** server components fetch from the API and pass data down. Good for
   first paint, but every dashboard interaction (filters, bulk actions, dialogs) would need server
   actions or route handlers that re-wrap each endpoint.
3. **Same-origin proxy + client-side fetching.** Next.js rewrites `/api/v1/*` to the API; the
   browser only ever talks to the web origin, and pages fetch with TanStack Query.

## Decision

Option 3.

- `next.config.ts` rewrites `/api/v1/:path*` to `API_URL`. Cookies are first-party in every
  environment and the browser never makes a cross-origin request. The API still enforces strict
  CORS for anything else.
- The API trusts `TRUST_PROXY_HOPS` proxies (1 locally) so rate limits and audit entries see the
  real client IP rather than the proxy's.
- Pages are client components using TanStack Query. The dashboard is behind a login and is
  interactive, so it gets little from server rendering; one data layer keeps it simple.
- **The session is renewed in one place.** The API client retries a 401 once after calling
  `/auth/refresh`. Because refresh tokens rotate and reuse revokes the whole family, concurrent
  401s share a single in-flight refresh, and the Web Locks API serialises refreshes across tabs.
  Without this, two parallel requests would refresh with the same token and sign the user out.
- **Permissions are mirrored, not enforced.** The role matrix lives in `packages/shared`; the UI
  uses it to hide actions a role cannot take, and the API guard remains the only enforcement.
- Forms validate with the same zod schemas the API uses, through a small local resolver rather
  than an extra dependency.
- Purchases carry an `Idempotency-Key` created when the form opens and kept until the API
  confirms the purchase, so a retry after a timeout cannot award points twice. Mutations are
  never retried automatically.

## Consequences

- One deployable origin for the browser; no cookie-domain configuration.
- `API_URL` is read when the web app builds and starts; changing it needs a restart.
- The web server forwards API traffic, adding a hop. That is acceptable at this scale; at higher
  scale an edge proxy or load balancer can route `/api/v1` straight to the API instead with no
  change to the browser code.
- Pages show skeletons on first load instead of server-rendered data. Acceptable for a
  signed-in tool; the public pages (landing, login, register) still render on the server.
