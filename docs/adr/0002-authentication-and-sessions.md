# ADR 0002: Cookie sessions with short-lived JWTs and rotating refresh tokens

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

Merchant staff use the dashboard all day on shared counter devices; customers use the portal on
their phones. We need authentication that:

- keeps tokens away from JavaScript (XSS should not be able to steal a session),
- lets us cut off a removed employee or a stolen session quickly,
- does not need a database lookup on every request just to authenticate,
- works for two audiences (merchant users and portal customers) without either token being
  accepted by the other side.

## Decision

**Two tokens, both in `httpOnly`, `Secure`, `SameSite=Lax` cookies.**

|             | Access token                    | Refresh token                                  |
| ----------- | ------------------------------- | ---------------------------------------------- |
| Format      | JWT (HS256, signed with `jose`) | 256-bit random value, stored as a SHA-256 hash |
| Lifetime    | 15 minutes                      | 30 days                                        |
| Cookie path | `/`                             | `/api/v1/auth` only                            |
| Verified by | signature (no DB hit)           | database lookup                                |

**Rotation with reuse detection.** Every refresh consumes the presented token (an atomic
`UPDATE ... WHERE revokedAt IS NULL`) and issues a successor in the same _family_. Presenting a
token that was already consumed means two parties hold it, so the whole family is revoked and
both must sign in again.

**Authorisation is looked up per request.** The JWT carries only the user id and audience. The
tenant guard reads the caller's membership on every `/tenants/:tenantId` request, so a role
change or removal takes effect on the next request rather than when the token expires. That is
one indexed primary-key lookup per request.

**Purpose-bound tokens.** Every JWT names its purpose in `aud` (`merchant`, `customer`, `signup`,
`password-reset`, `invitation`); a token minted for one purpose is rejected for every other.

- _Sign-up_ (added 2026-10-20) asks for the details but no password, and answers every address
  with the same empty 202. A new address is emailed a `signup` link carrying the details;
  choosing a password from it creates the user, business and programme in one transaction and
  marks the email verified. An address that already has an account is emailed a reminder to
  sign in instead. So sign-up no longer reveals who has an account (it used to answer 409), and
  every account's email is proven. The link works once because the address has an account
  afterwards; two uses at the same instant are settled by the unique email. The cost is one
  extra step for new merchants.

- _Password reset_ tokens embed a fingerprint of the current password hash, so they become
  invalid the moment the password changes: single-use without a token table. A reset also
  revokes every refresh token for the user.
- _Invitations_ are rows in an `Invitation` table; the emailed JWT names the row. The row makes
  links single-use and revocable, and lets the Team page list pending invitations. (A stateless
  token alone would let a removed member rejoin with an old link.)

**CSRF.** `SameSite=Lax` blocks cross-site cookie sending on POSTs; additionally every
state-changing request must carry `X-Requested-With`, which a cross-site form cannot set and a
cross-site `fetch` cannot set without a CORS preflight that only the web origin passes.

**Brute force.** Login is limited to 5 attempts per minute per IP and email, and 30 per minute
per IP across all emails, which stops one client spraying a common password over many accounts
(Redis fixed windows, shared by all API instances). Unknown emails take as long as wrong
passwords (a dummy argon2 verification) and return the same error. Emails sent on request
(sign-up, password reset) are limited per IP and per address.

## Alternatives considered

- **Server-side sessions only (opaque session id + Redis).** Simplest revocation, but every
  request needs a store lookup and the store becomes a hard dependency for every call.
- **Long-lived JWT in `localStorage`.** Readable by any injected script; cannot be revoked.
- **Roles inside the JWT.** Saves the membership lookup but keeps a demoted or removed user
  privileged until expiry. The lookup is cheap; the stale-privilege window is not.
- **A third-party identity provider.** Out of scope for v1 (no SSO), and the point of this
  project is to show the mechanics.

## Consequences

- A stolen access token is usable for at most 15 minutes. A stolen refresh token is usable until
  the legitimate client next refreshes, at which point both are locked out.
- Two browser tabs refreshing at the same instant can trip reuse detection. The web client must
  serialise refreshes (one in-flight refresh shared by all requests).
- Merchant and portal sessions can coexist in one browser because they use different cookie
  names and paths.
