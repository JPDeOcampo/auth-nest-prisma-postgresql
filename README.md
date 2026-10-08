# Authentication API

NestJS authentication API using PostgreSQL, Prisma, Firebase Admin, and Nodemailer.
Nest owns the HTTP controllers, providers, guards, validation, error handling, and
infrastructure lifecycle. `@nestjs/platform-express` is the HTTP adapter; there
is no separate Express application or legacy Express route layer.

## Requirements

- Node.js 24 or a compatible supported release
- PostgreSQL
- Redis (shared throttles, reset challenges, OTP attempt caps)
- SMTP credentials
- Firebase Admin service-account credentials for OAuth routes

## Local setup

1. Install dependencies with `pnpm install` (the repository uses `pnpm-lock.yaml`).
2. Copy `.env.sample` to `.env` and set the local database, Redis, SMTP, and
   Firebase values. The sample values are placeholders, not deployable credentials.
3. Apply migrations with `pnpm run db:migrate:deploy` (separate release step;
   do not run migrations automatically from every application replica).
4. Regenerate the client after schema changes with `npx prisma generate`
   (output: `src/generated/prisma`).
5. Start the development server with `pnpm run dev`.
6. Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm test` before submitting
   changes.

The default API port is `5000`. The frontend origin and backend origin are
configured by `ORIGIN` and `BACKEND_URL`.

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
  generated/prisma/               Generated Prisma client (do not edit)
prisma/
  schema.prisma                   Data model (enums, models, indexes)
  migrations/                     Checked-in migrations
```

Feature services use constructor-injected providers. Prisma is lifecycle-managed
by Nest and is not instantiated as a process-wide singleton. Auth and user
controllers retain the `/api/v1` routes and response shapes. Password-reset
challenge IDs are opaque values, not database user IDs.

## Data model (`prisma/schema.prisma`)

Enums: `AuthProvider` (`LOCAL`, `GOOGLE`, `GITHUB`), `UserRole`
(`USER`, `ADMIN`), `UserStatus` (`ACTIVE`, `SUSPENDED`, `BANNED`, `DELETED`),
`EmailStatus` (`UNVERIFIED`, `VERIFIED`, `BLOCKED`), `AppearanceType`
(`COLOR`, `IMAGE`), `AuthTokenType` (`PASSWORD_RESET`, `EMAIL_VERIFICATION`).

- `User`: `email` is unique and always stored lowercase + trimmed.
  Tracks `role`, `status`, `emailStatus`, `emailVerifiedAt`,
  `passwordChangedAt` (set on every password change), `deletedAt`
  (set when `status = DELETED`), `loginCount`/`loginAttempts`,
  `lockoutUntil`, `lastLoginAt`. Indexed on `status`.
- `Account`: one row per (`userId`, `provider`); unique on
  (`provider`, `providerAccountId`). `LOCAL` rows are keyed by the **user id**
  (not the email, so email changes need no account sync); OAuth rows use the
  provider subject id. `passwordHash` is set only for `LOCAL`.
- `EmailChangeRequest`: at most **one pending request per user**
  (`userId @unique`). `newEmail` is intentionally **not** unique (prevents
  address reservation); `User.email`'s unique constraint wins at confirm
  time. Carries its own `tokenHash @unique`, `expiresAt`, `confirmedAt`.
- `AuthToken`: one-time tokens (`EMAIL_VERIFICATION`, `PASSWORD_RESET`)
  storing only the SHA-256 `tokenHash`. Indexed on (`userId`, `type`) and
  (`type`, `expiresAt`).
- `RefreshToken`: stores only `tokenHash`. Rotation with reuse detection:
  all tokens descended from one login share a `familyId`; presenting a
  revoked/expired token revokes the whole family (`revokedAt`) and forces
  re-login. `replacedById` links each rotation. TTL 7 days, max 5 active
  sessions per user. Indexed on `userId`, `familyId`, `expiresAt`.
- `AuditLog`: append-only, no FK (history survives user deletion).
  Indexed on (`userId`, `createdAt`) and (`event`, `createdAt`).

Two CHECK constraints must be added in a custom migration
(`prisma migrate dev --create-only`, then edit `migration.sql`):

```sql
ALTER TABLE "User" ADD CONSTRAINT user_email_lowercase
  CHECK (email = lower(email));

ALTER TABLE "Account" ADD CONSTRAINT account_local_requires_password
  CHECK (
    (provider = 'LOCAL'  AND "passwordHash" IS NOT NULL) OR
    (provider <> 'LOCAL' AND "passwordHash" IS NULL)
  );
```

## Auth behavior

- Access tokens expire in 15m; refresh tokens in 7d (JWT `purpose: "auth"`).
- Register creates user + profile + settings + `LOCAL` account in one
  transaction, then sends an `EMAIL_VERIFICATION` `AuthToken`.
- Login resolves `User` by normalized email, then the `LOCAL` account;
  5 bad passwords lock the account for 15 minutes. Success rotates
  `loginCount`/`lastLoginAt` and records a refresh session with ip/ua.
- Email change uses `sendEmailChange()`: one upserted `EmailChangeRequest`
  plus its `EMAIL_VERIFICATION` `AuthToken` sharing the same hash/expiry;
  verification mail goes to the **new** address. Confirming sets
  `email = newEmail`, `emailStatus = VERIFIED`, `emailVerifiedAt`, and
  deletes both rows. Cancelling deletes by `{ userId }`.
- Password update/reset sets `passwordChangedAt`, deletes all refresh
  tokens, and clears `PASSWORD_RESET` tokens.
- Serialized users expose singular `emailChangeRequest` (not the old
  plural array), plus `role` and `emailVerifiedAt`.

## API routes

Auth (`/api/v1/auth`): `POST signup`, `POST resend-verification-email/:id`,
`GET verify-email?token=`, `POST login`, `POST oauth-login`,
`POST refresh-token`, `POST update-email/:id`, `POST remove-new-email/:id`,
`PUT update-password/:id`, `POST forgot-password`,
`POST reset/verify-reset-password/:id`, `POST reset/resend-reset-password/:id`,
`GET reset/refresh-reset-password`, `POST reset/reset-password/:id`,
`POST delete-user/:id`, `POST delete-user-oauth/:id`, `POST single-logout`.

User (`/api/v1/user`): `PUT update-profile/:id`, `PUT update-settings/:id`.
Health: `GET /health/live`, `GET /health/ready`.

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
after password changes. Refresh reuse revokes the whole token family, and
the hardened migration adds lowercase-email and LOCAL-password CHECK
constraints. Production startup requires TLS Redis, TLS PostgreSQL,
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
