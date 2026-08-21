# Deployment

The project is platform-neutral. No Railway, Render, Fly.io, AWS, or other platform-specific manifest
is committed until a deployment target is selected.

## Release sequence

Use the same immutable source revision for all three steps:

1. Build the production artifact or production Docker target with `npm ci`, Prisma Client generation,
   and `npm run build`.
2. In one release/deploy job, run `npm run db:migrate:deploy` against the production database.
3. Start application instances with `npm start` only after migration succeeds.

Never run `prisma migrate dev` in production, and do not make every application replica race to run a
migration during startup. The production image includes the Prisma schema, migrations, generated
client, and the CLI path needed for the separate migration command; it never contains an `.env` file.

## Required configuration

Provide and review the following production configuration:

- Runtime: `NODE_ENV=production`, `PORT`, `LOG_LEVEL`, `TRUST_PROXY`, `ENABLE_API_DOCS`.
- Database: `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_CONNECTION_TIMEOUT_MS`.
- Browser access: explicit `CORS_ORIGINS`.
- JWT: `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS`.
- Refresh delivery: `AUTH_REFRESH_TRANSPORT`, `AUTH_REFRESH_COOKIE_NAME`, `COOKIE_SECURE`,
  `COOKIE_SAME_SITE`, and optional `COOKIE_DOMAIN`.

`TEST_DATABASE_URL` is for CI/test jobs, not the application service. `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` are optional and should normally be absent in production.

- Secrets must be generated outside Git and supplied by the platform's secret manager.
- Keep access and refresh secrets different and plan a deliberate rotation procedure.
- Set `ENABLE_API_DOCS=false` when public interactive documentation is not wanted.
- Ensure the database permits TLS when the provider requires it; encode connection parameters in the
  managed connection URL without logging that URL.

## Health and lifecycle

- Liveness: `GET /health/live`. It does not query dependencies.
- Readiness: `GET /health/ready`. It performs a small PostgreSQL query and returns 503 when unavailable.
- Route traffic only to ready instances and allow enough startup time for a database connection.
- The process handles SIGTERM/SIGINT by stopping new HTTP work, closing the server, disconnecting
  Prisma and the pool, then exiting. Configure the platform termination grace period longer than the
  application's shutdown timeout.

## Proxy, CORS, and cookies

Set `TRUST_PROXY` to the actual number/type of trusted proxies. An incorrect value can break secure
cookie detection, client IP logging, and IP rate limiting.

Use exact frontend origins in `CORS_ORIGINS`; wildcard origins are forbidden with credentials. For a
separate frontend site using cookie refresh transport:

- the frontend must send credentials;
- CORS must allow that exact origin and credentials;
- HTTPS requires `COOKIE_SECURE=true`;
- truly cross-site cookies generally require `COOKIE_SAME_SITE=none` and Secure;
- set `COOKIE_DOMAIN` only when sharing across appropriate subdomains.

Body refresh transport avoids browser cookie rules but requires the client to protect the token from
script-access and storage attacks. Select one transport; do not expose both simultaneously.

## Database capacity

Set `DATABASE_POOL_MAX` per instance so `replica count × pool max` stays below the database connection
limit, leaving capacity for migrations and administration. Keep connection timeouts finite. If the
provider supplies a transaction pooler, verify its Prisma compatibility and use its recommended URL.

## Scaling notes

The in-memory rate limiter is suitable for one hackathon instance. Multiple instances need a shared
limiter store to enforce global limits. Realtime connections likewise need a shared adapter, and
durable background work needs a queue. Add these only when deployment topology requires them.

## Platform checklist

For Railway, Render, Fly.io, AWS, or another provider, confirm:

- Node 24 or the production Docker image is used;
- PostgreSQL 18 connectivity, TLS, backups, and connection limits;
- a one-off release command can run `npm run db:migrate:deploy`;
- the service listens on the injected `PORT` and `0.0.0.0`;
- readiness/liveness paths and shutdown grace period are configured;
- secrets are injected at runtime, not baked into an image;
- persistent uploads are stored in object storage, not the container filesystem;
- CORS, proxy count, cookie domain, and HTTPS behavior match the deployed domains.
