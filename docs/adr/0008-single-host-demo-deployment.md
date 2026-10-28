# ADR 0008: The public demo runs on one host with Docker Compose

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

PointsHub has three processes (web, API, worker) and needs PostgreSQL, Redis, RabbitMQ and an
SMTP server. The public deployment is a demo: a few visitors at a time, data reset every night,
no real customers. It should be cheap, simple to rebuild from the repository, and close enough
to production practice that the setup itself is worth reading.

Options considered:

| Option                                                            | For                                                        | Against                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **One VM running Docker Compose behind Caddy**                    | ~€4 a month; same topology as local; one file describes it | One machine to patch; no failover; backups are our job                                        |
| Platform per service (Fly.io/Render + Neon + Upstash + CloudAMQP) | Managed databases and backups; per-service scaling         | Five accounts and their free-tier limits; cross-provider latency; RabbitMQ is the awkward one |
| Kubernetes                                                        | The real-world answer at scale                             | Far more moving parts than a demo needs                                                       |

## Decision

**One VM, one Compose file** (`deploy/compose.yml`). Only Caddy publishes ports; it obtains
TLS certificates automatically and proxies the site to the web app, and `/api/docs` to the API.
The database, Redis, RabbitMQ and the API are reachable only on the Compose network.

**One multi-stage `Dockerfile` with a target per app** (`api`, `worker`, `web`, `tools`). The
monorepo is installed and built once; each runtime image then receives only what it runs:
`pnpm deploy --prod` output for the API and worker, Next.js's traced standalone server for the
web app. All run as the unprivileged `node` user. Separate Dockerfiles would repeat the install
and build three times.

**Migrations are a one-off job.** The `migrate` service runs `prisma migrate deploy` from the
`tools` image and exits; the API and worker start only after it succeeds, so code never runs
against an older schema.

**The web image is built for its deployment.** Next.js fixes rewrite destinations and
`NEXT_PUBLIC_*` values at build time, so `API_URL` and the demo inbox URL are build arguments.
The image is built on the server by `docker compose up --build`, which keeps that natural.

**Demo email goes to a public Mailpit inbox.** Sign-up, joining the portal and password resets
all work by emailed link (ADR 0002, ADR 0006). Delivering real email would need a sending domain
and would let the demo send mail to arbitrary addresses. Instead Mailpit captures everything and
its UI is published as the demo inbox, linked from every "Check your email" screen.

**The demo resets nightly** with `seed --wipe`: every table but the migration history is
truncated and the demo businesses are recreated, so businesses visitors created disappear too.

## Consequences

- Deploying is `git pull && docker compose up -d --build`; the whole environment is in the
  repository except one `.env` file of secrets.
- No high availability: a host failure takes the demo down until it is rebuilt. Acceptable for a
  demo; a production deployment would move PostgreSQL to a managed service with point-in-time
  recovery first, then run the stateless images on a platform with several instances.
- Anyone can read the demo inbox, and with it any sign-up or reset link sent from the demo. The
  screens say so and ask for made-up addresses; the nightly wipe bounds the damage to a day of
  demo data (see [SECURITY.md](../SECURITY.md#accepted-risks)).
- The `tools` image is large (the full workspace, for the Prisma CLI and the TypeScript seed),
  but it never runs as a long-lived service.
