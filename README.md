# Authentication API

NestJS authentication API using PostgreSQL, Prisma, Firebase Admin, and Nodemailer.
Nest owns the HTTP controllers, providers, guards, validation, error handling, and
infrastructure lifecycle. `@nestjs/platform-express` is the HTTP adapter; there
is no separate Express application or legacy Express route layer.

## Requirements

- Node.js 24 or a compatible supported release
- PostgreSQL
- SMTP credentials
- Firebase Admin service-account credentials for OAuth routes

## Local setup

1. Install dependencies with `pnpm install` (the repository uses `pnpm-lock.yaml`).
2. Copy `.env.sample` to `.env` and set the local database, SMTP, and Firebase
   values. The sample values are placeholders, not deployable credentials.
3. Start the development server with `pnpm run dev`.
4. Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm test` before submitting
   changes.

The default API port is `5000`. The frontend origin and backend origin are
configured by `ORIGIN` and `BACKEND_URL`. The Prisma schema and checked-in
migrations are under `prisma/`; run `pnpm run db:migrate:deploy` as a separate
release step before starting new application code. Do not run migrations
automatically from every application replica at startup.

## Project structure

```text
src/
  main.ts                         Nest bootstrap and HTTP adapter setup
  app.module.ts                   Root feature composition
  nest/
    auth/                         Authentication routes and module
    user/                         Profile/settings routes and module
    services/                     Feature providers and use cases
    infrastructure/               Prisma, mail, Firebase, and token adapters
    validation/                   Zod schemas and Nest validation pipe
    guards/                       Authentication guards
    filters/                      HTTP exception mapping
    utils/, constants/, types/    Nest-owned shared helpers and contracts
```

Feature services use constructor-injected providers. Prisma is lifecycle-managed
by Nest and is not instantiated as a process-wide singleton. Auth and user
controllers retain the `/api/v1` routes and response shapes. Password-reset
challenge IDs are opaque values, not database user IDs.

## Environment

`src/nest/config/environment.ts` validates configuration before the Nest app is
created. Required variables:

| Variable | Purpose |
| --- | --- |
| `ORIGIN` | Frontend origin allowed by credentialed CORS |
| `BACKEND_URL` | Public backend origin used in verification links |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Shared Redis connection; required as `rediss://` in production |
| `REDIS_PREFIX` | Unique Redis key namespace per environment; required in production |
| `TRUST_PROXY` | Comma-separated trusted proxy IPs/CIDRs; required in production |
| `JWT_ACCESS_SECRET` | Access-token signing and verification secret |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret; must differ from access secret |
| `PEPPER` | Secret used before bcrypt password hashing |
| `EMAIL_USER`, `EMAIL_PASS` | SMTP credentials |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin service-account settings |
| `PORT` | Optional listen port (default `5000`) |
| `EMAIL_FROM` | Required sender address in production |
| `DOMAIN` | Optional cookie domain |

In production, frontend/backend origins must use HTTPS, PostgreSQL must use
`sslmode=require`, `verify-ca`, or `verify-full`, and each JWT secret and the
pepper must be distinct random values of at least 32 characters. Keep
secrets in the hosting platform's secret manager; do not commit `.env`.
Set `TRUST_PROXY` only to actual reverse-proxy addresses/CIDRs so client-IP
limits cannot be spoofed through `X-Forwarded-For`. Use private TLS-enabled
Redis reachable only by application instances, and assign each environment a
unique `REDIS_PREFIX`. `/health/live` checks process liveness;
`/health/ready` checks PostgreSQL and Redis readiness without returning
dependency details.

## Commands

| Command | Description |
| --- | --- |
| `pnpm run dev` | Watch and run `src/main.ts` |
| `pnpm run typecheck` | Type-check without emitting files |
| `pnpm run build` | Compile TypeScript and rewrite aliases for Node ESM |
| `pnpm start` | Run `dist/main.js` |
| `pnpm run db:migrate:deploy` | Apply checked-in migrations as a release step |
| `pnpm test` | Run Vitest (generated `dist` tests are excluded) |
| `pnpm run lint` | Run ESLint with the repository flat config |

## Architecture status and production readiness

The code is organized along idiomatic Nest boundaries—feature modules,
controllers, injectable services, infrastructure providers, guards, pipes, and
exception filters—and the former Express implementation layer has been removed.
This is a sound Nest architecture baseline, but passing build and tests alone
does **not** certify the service as production-ready.

The application now uses Redis-backed shared IP throttles for the API and
high-risk authentication routes, including a per-email reset-request cap,
limits reset OTP guesses to five per-user window, enforces cookie-origin checks
and security headers, validates reset-token purpose and subject, uses opaque
reset challenge IDs to avoid returning
internal user IDs, consumes OTPs atomically, and revokes refresh/reset tokens
after password changes. Production startup requires TLS Redis, TLS PostgreSQL,
and explicit proxy trust configuration.

Current defaults are 600 requests per IP per 15 minutes for `/api/v1`, 120 for
auth routes, 10 login/OAuth attempts per minute, 10 signup attempts per 15
minutes, 5 verification resends per 15 minutes, 30 refresh attempts per minute,
5 forgot-password attempts per IP per 15 minutes and 3 per normalized email
per hour, 10 OTP-verification requests per IP per 15 minutes, and 5 reset
resends and submissions each per 15 minutes. Failed OTP guesses are additionally
capped at 5 per account per 10 minutes. These defaults require review against
the service's actual traffic.

Before exposing it to real users, close or explicitly accept these operational
and security items:

- Tune rate-limit thresholds against expected traffic and verify trusted proxy
  CIDRs and forwarded-IP behavior in the actual load balancer/network.
- Exercise cookie, CORS, TLS termination, OAuth, SMTP failure/retry, and
  database migration behavior in the actual deployment environment.
- Add database-backed integration tests; current tests primarily mock
  providers and protect HTTP compatibility.
- Move password-reset email delivery to a durable asynchronous queue before
  relying on timing-sensitive account-enumeration protections; SMTP delivery is
  currently synchronous.
- Review incident/audit logging, secret rotation, backup/restore, monitoring,
  deployment rollback, and dependency-update procedures.
- Validate production TLS certificates and Redis/DB failover, capacity, backup,
  and restore procedures; establish alerting and incident response.

Production readiness still depends on a real deployment review, managed
PostgreSQL/Redis, secret provisioning, migrations, external-service credentials,
monitoring, and tested recovery procedures. Do not expose production traffic
until those environment-specific controls have been exercised.
