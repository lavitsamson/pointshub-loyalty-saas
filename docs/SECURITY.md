# Security

The threats PointsHub was designed against, how each is mitigated, and where the mitigation is
tested. Accepted risks are listed at the end.

PointsHub is a demo project: please report anything you find by opening a GitHub issue.

## Assets and actors

- **Assets:** each business's customer list (names, emails, phones), points balances (worth
  rewards), staff accounts, and billing state.
- **Actors:** merchant staff (owner, admin, staff), customers using a business's portal,
  anonymous visitors, Stripe (webhooks), and an attacker who may hold an account at _another_
  business.

## Threats and mitigations

### Tenant data leakage

A user of business A reading or changing business B's data.

- One shared database with `tenantId` on every tenant-owned row ([ADR 0001](adr/0001-multi-tenancy.md)).
- Tenant context comes only from the caller's membership, read per request by a guard; never
  from the request body.
- A Prisma Client extension adds `tenantId` to every query on tenant-owned models and **fails
  closed**: a query without a tenant context throws. Raw SQL takes `tenantId` explicitly.
- Ids in request bodies (customer, reward) are looked up through the same scoped client, so a
  foreign id is simply "not found".
- Portal requests are scoped by the business's slug, and the customer's access token names its
  business (`tid` claim): a valid token from one portal is rejected by every other.

**Tests:** `tenant-isolation.int-spec.ts` and `portal-isolation.int-spec.ts` probe every
tenant-scoped route with another tenant's ids, and fail if a route is added without a probe.
`tenant-scope.spec.ts` / `tenant-scope.int-spec.ts` cover the extension.

### IDOR and existence leaks

Guessing ids to discover that a resource exists.

- Ids are UUIDs (v7), not sequences.
- No membership in a tenant answers **404, never 403**, exactly as if the tenant did not exist.
  403 is only returned once the caller is known to be a member (insufficient role).
- Redemption codes are short for counter use but looked up only within the caller's business.

### Account enumeration

Learning whether an email has an account (a privacy leak, and a target list for phishing).

- Merchant sign-up, password reset, portal join and portal password reset all give **one
  identical answer** for every address and do the differentiating by email: a new address gets
  a link to finish, a known one gets a reminder or a reset link ([ADR 0002](adr/0002-authentication-and-sessions.md),
  [ADR 0006](adr/0006-customer-portal-sessions.md)).
- Login returns the same error for an unknown email and a wrong password, and spends the same
  time (a dummy argon2 verification).
- Email delivery failures are logged, never returned.

**Tests:** `auth.int-spec.ts` ("answers new and registered addresses identically"),
`portal.int-spec.ts`.

### Credential attacks

Guessing passwords, credential stuffing, password spraying.

- argon2id (19 MiB, 2 iterations), minimum 12 characters, maximum 128 (bounds hashing cost).
- Login limited to 5 attempts a minute per IP and email, and 30 a minute per IP across all
  emails. Both are Redis fixed windows shared by all API instances.
- Rate limits read the client IP from `X-Forwarded-For` only as many hops back as
  `TRUST_PROXY_HOPS` says, so a client cannot pick its own IP.

**Tests:** login, spraying and portal login rate-limit cases in the integration suites.

### Session and token theft

- Access (15 min JWT) and refresh (30 days, opaque) tokens live only in `httpOnly`, `Secure`,
  `SameSite=Lax` cookies, out of reach of page scripts. The refresh cookie is sent only to the
  auth endpoints; portal cookies only to their own portal's path.
- Refresh tokens are stored as SHA-256 hashes and **rotate** on every use. Presenting a used one
  means it was copied, so its whole family is revoked ([ADR 0002](adr/0002-authentication-and-sessions.md)).
- Every JWT names its purpose (`aud`): an invitation or reset token is useless as a session.
- Password reset links embed a fingerprint of the current password hash, so they work once;
  resetting revokes every refresh token for the account.
- Roles are not in the token; a removed or demoted member loses access on their next request.

**Tests:** refresh rotation, reuse detection, logout and reset cases in `auth.int-spec.ts`;
web client single-flight refresh ([ADR 0004](adr/0004-web-app-api-access.md)).

### Cross-site request forgery and clickjacking

- `SameSite=Lax` cookies, and every state-changing request must carry `X-Requested-With`. A
  cross-site form cannot set it; a cross-site `fetch` that sets it needs a CORS preflight, and
  CORS allows the web origin only.
- The browser talks only to the web app's origin; `/api/v1` is proxied, so cookies are
  first-party ([ADR 0004](adr/0004-web-app-api-access.md)).
- Pages are sent with `frame-ancestors 'none'` and `X-Frame-Options: DENY`.

**Tests:** CSRF header case in `auth.int-spec.ts`; security headers in `e2e/home.spec.ts`.

### Cross-site scripting and injection

- React encodes all output; there is no `dangerouslySetInnerHTML`.
- A Content Security Policy limits scripts, styles, images and connections to the app's own
  origin, blocks plugins and `<base>` changes, and limits form targets. It allows inline
  scripts (see accepted risks).
- Every request body, query and parameter is validated with zod schemas shared with the web
  app; unknown fields are dropped.
- SQL goes through Prisma's parameterised queries; the few raw queries are tagged templates.
- CSV exports prefix cells starting with `= + - @` so spreadsheets show them as text
  (formula injection). **Tests:** `csv.spec.ts`.

### Abuse of email-sending endpoints

Using sign-up, reset or join forms to flood someone's inbox.

- Limited per IP and per address (sign-up: 20 an hour per IP, 5 per 15 minutes per address;
  resets and portal joins: 5 per 15 minutes per address).

### Points fraud and race conditions

- Every balance change locks the customer row, writes an append-only ledger entry and updates
  the cached balance in one transaction; the balance cannot go negative
  ([ADR 0003](adr/0003-points-ledger.md)). A database trigger rejects updates and deletes on the
  ledger.
- Purchases require an `Idempotency-Key`, so a retried request cannot double-award points.
- Reward stock and plan limits are checked under row locks.
- Membership changes lock the business, so two owners removing each other at once cannot leave
  it without an owner.

**Tests:** ledger invariant after 200 random operations, 10 concurrent redemptions, idempotent
purchases, concurrent owner removal.

### Webhook spoofing and replay

- Stripe webhooks are verified against the signature over the raw request body; anything else
  is rejected before parsing.
- Event ids are recorded in the same transaction as their effects, so duplicates (even
  concurrent ones) apply once. The subscription is re-read from Stripe under a tenant lock, so
  out-of-order events cannot set a stale plan ([ADR 0007](adr/0007-billing-and-plan-limits.md)).
- Only test-mode keys are accepted.

**Tests:** `billing.int-spec.ts` (bad signatures, duplicates, ordering).

### Privilege escalation inside a business

- One permission matrix in `packages/shared` drives both the API guard and the UI.
- Admins cannot invite, promote, demote or remove owners; nobody can invite an owner; billing
  and tenant deletion are owner-only.
- Every admin mutation writes an audit log entry with before/after values, IP and user agent.

**Tests:** `permissions.test.ts` (the full matrix), role cases in `team.int-spec.ts`.

### Secrets, logs and supply chain

- All configuration comes from validated environment variables; the API refuses to start with
  the example `JWT_SECRET` in production or a live Stripe key.
- Logs redact cookies, `Authorization` and `Set-Cookie`. Responses never include password or
  token hashes (explicit response mapping). Unexpected errors return a bare 500.
- Helmet on the API, a 100 kB request body limit.
- pnpm refuses dependency versions published less than 14 days ago (`minimumReleaseAge`), and
  the lockfile pins exact versions.

### Prompt injection (future)

"Ask your data" is a [proposed feature](PROGRESS.md#proposed-features), not built. Its design
already constrains the threat: the model calls a fixed set of tenant-scoped, zod-validated tools
and never writes SQL, so injected instructions cannot reach other tenants' data or raw queries.

## Accepted risks

- **Access tokens outlive logout by up to 15 minutes.** They are verified by signature only.
  Logout and password resets revoke refresh tokens, and membership is checked per request, so
  the window is limited to the account's own data. A token denylist would remove it at the cost
  of a Redis lookup per request.
- **The CSP allows inline scripts.** Next.js and the theme switch need them unless every page
  is rendered per request with a nonce. The policy still blocks third-party scripts, data
  exfiltration through `fetch`, plugins and framing.
- **Rate limits use fixed windows**, which allow a short burst at a window boundary.
- **Invitation previews say whether the invited email already has an account**, so the page can
  ask for a password or a name. Only the holder of the signed link sees it.
- **The OpenAPI document at `/api/docs` is public.** It describes routes that are all
  authenticated and documented in the repository anyway.
