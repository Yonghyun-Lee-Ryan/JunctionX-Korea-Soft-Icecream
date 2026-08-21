# JunctionX hackathon backend harness

A reusable modular-monolith REST API starter. Authentication, validation, errors, logging, PostgreSQL, OpenAPI, tests, and Docker are connected so the team can focus on business features when the topic is announced.

## Stack and prerequisites

- Node.js 24 LTS, npm, strict TypeScript ESM, Express 5
- PostgreSQL 18, Prisma ORM 7 with `@prisma/adapter-pg`
- Zod 4, OpenAPI 3.1, Swagger UI, Pino
- `jose` JWT, `bcryptjs`, Vitest, Supertest
- Docker Engine with Compose v2 (recommended)

Install Node 24 with your version manager (`.node-version` and `.nvmrc` are included). Docker Desktop is sufficient on macOS and Windows.

## Five-minute quick start

```sh
cd backend
cp .env.example .env
docker compose up -d db
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000/health/live`, `http://localhost:3000/docs`, or `http://localhost:3000/openapi.json`. The example secrets and database password are local-only values; replace them before any shared deployment. Generate strong JWT secrets with `npm run secret:generate` (run it twice).

The optional admin seed runs only when both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set. It is an idempotent upsert and no administrator password is stored in the repository.

## Environment variables

Copy `.env.example`; tests use a separate `.env.test` based on `.env.test.example`. Startup validates the environment once in `src/config/env.ts`. Important groups are:

- Runtime: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `TRUST_PROXY`, `ENABLE_API_DOCS`
- Database: `DATABASE_URL`, `TEST_DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_CONNECTION_TIMEOUT_MS`
- Browser: comma-separated `CORS_ORIGINS`
- JWT: issuer, audience, separate 32-byte minimum access/refresh secrets, and TTL seconds
- Refresh transport: `AUTH_REFRESH_TRANSPORT`, cookie name, Secure, SameSite, and optional Domain
- Optional seed: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`

Do not read environment variables directly from application modules. Prisma CLI, scripts, and test bootstrap are the intentional pre-start exceptions.

## Docker workflows

Run the database while the API runs on the host:

```sh
docker compose up -d db
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Run API and PostgreSQL together with bind-mounted source and an isolated container `node_modules` volume:

```sh
docker compose up --build
```

PostgreSQL initializes `junctionx` and `junctionx_test` in a PostgreSQL 18-specific named volume. Init SQL runs only for a new volume. The project intentionally uses a new PG18 volume path (`/var/lib/postgresql`), so an older PG17 data volume is never mounted into PG18.

Use `npm run docker:logs` to follow both services and `npm run docker:down` to stop them without deleting data. Production images use the non-root `node` user and contain the Prisma CLI/schema/migrations so a release job can run `npm run db:migrate:deploy`.

## npm commands

| Command                                  | Purpose                                                |
| ---------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                            | Watch and run the TypeScript server                    |
| `npm run build` / `npm start`            | Compile and run production JavaScript                  |
| `npm run lint` / `lint:fix`              | Check or repair lint findings                          |
| `npm run format` / `format:check`        | Write or check Prettier formatting                     |
| `npm run typecheck`                      | Strict TypeScript check                                |
| `npm test` / `test:watch`                | Prepare the test DB and run/watch tests                |
| `npm run test:unit` / `test:integration` | Run a focused suite                                    |
| `npm run test:coverage`                  | Generate text and HTML coverage                        |
| `npm run db:generate` / `db:validate`    | Generate Prisma Client / validate schema               |
| `npm run db:migrate -- --name change`    | Create and apply a development migration               |
| `npm run db:migrate:deploy`              | Apply committed migrations in test/production          |
| `npm run db:seed` / `db:studio`          | Explicitly seed / inspect data                         |
| `npm run db:test:prepare`                | Guard and migrate the dedicated `_test` DB             |
| `npm run secret:generate`                | Print a cryptographically random 48-byte secret        |
| `npm run generate:module -- orders`      | Generate a safe feature skeleton                       |
| `npm run smoke`                          | Exercise a running server end to end                   |
| `npm run verify`                         | Validate Prisma, format, lint, types, tests, and build |
| `npm run docker:up/down/logs`            | Manage Compose services                                |

## Database and tests

Create schema changes only with development migrations:

```sh
npm run db:migrate -- --name add-orders
```

Commit both `schema.prisma` and the generated migration. Test and production environments use `prisma migrate deploy`; the shared flow never uses `db push`.

Tests require `TEST_DATABASE_URL` whose database name ends in `_test`. The preparation script refuses unsafe names and refuses the same database name as `DATABASE_URL`, then applies committed migrations. Between integration tests only the known `RefreshSession` and `User` tables are deleted in dependency order. Vitest uses one worker to prevent shared-DB races.

```sh
cp .env.test.example .env.test
npm test
npm run test:coverage
```

## Authentication

Registration and login return an Access Token and create a hashed RefreshSession. Access and Refresh JWTs use different secrets, issuer/audience validation, expiry, and a required `type` claim. Only the SHA-256 refresh-token hash is stored.

On refresh, the signature and claims are verified, the session is found by `jti`, its hash/expiry/revocation are checked, and a conditional update atomically revokes it before creating a new session. Concurrent reuse cannot make both requests succeed. Logout revokes one session; logout-all revokes all active sessions for the authenticated user. Password hashing is isolated behind `password.service.ts`; `bcryptjs` avoids native build failures across macOS, Windows, and Linux and can later be replaced with Argon2.

`AUTH_REFRESH_TRANSPORT=cookie` stores the refresh token in an HttpOnly cookie and omits it from JSON. Production requires `COOKIE_SECURE=true`; use `COOKIE_SAME_SITE=none` plus HTTPS when the frontend is on a different site, set `COOKIE_DOMAIN` only when needed, list the exact frontend origin in `CORS_ORIGINS`, and send browser requests with credentials.

`AUTH_REFRESH_TRANSPORT=body` returns and accepts the refresh token only in JSON. It works for native clients and simple cross-domain demos, but the frontend must keep it out of persistent browser storage and protect it from XSS. The two transports are intentionally not accepted simultaneously.

## API and smoke test

Swagger UI is `/docs`; OpenAPI 3.1 JSON is `/openapi.json`. Set `ENABLE_API_DOCS=false` to disable both. Request examples are in `requests/api.http`.

Minimal curl flow in cookie mode:

```sh
curl -s http://localhost:3000/health/ready
curl -i -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"Hackathon!2026","displayName":"Demo"}' \
  http://localhost:3000/api/v1/auth/register
curl -s -b cookies.txt -X POST -H 'content-type: application/json' -d '{}' \
  http://localhost:3000/api/v1/auth/refresh
```

For the complete register/login/me/rotation/logout check, start the server and run `npm run smoke`. Use `SMOKE_BASE_URL=http://127.0.0.1:3100 npm run smoke` when testing a safe alternate port.

## Adding a module

```sh
npm run generate:module -- orders
```

The generator safely converts kebab/camel/Pascal names, refuses invalid names and overwrites, creates route/controller/service/schema plus a unit-test skeleton, and prints the exact manual import/mount lines. Follow `docs/MODULE_TEMPLATE.md`, register runtime and OpenAPI routes, and add integration tests.

## Deployment

Use a platform-neutral release sequence:

1. Build the production image or run `npm ci && npm run db:generate && npm run build`.
2. In one release/deploy job run `npm run db:migrate:deploy`.
3. Start each instance with `npm start`; do not run `migrate dev` or let every replica migrate.
4. Configure `/health/live` for liveness and `/health/ready` for readiness.
5. Set production secrets, exact CORS origins, `TRUST_PROXY`, secure cookie settings, and a database pool sized across all replicas.

See `docs/DEPLOYMENT.md` for Railway, Render, Fly.io, AWS, and other targets. No platform-specific config is committed yet.

## Troubleshooting

- Environment error at startup: compare keys with `.env.example`; secrets must be at least 32 bytes.
- Test preparation refusal: use a separate database name ending `_test`, never the development database.
- PostgreSQL port occupied: set `POSTGRES_PORT=55432` and update host URLs; do not kill an unrelated process.
- API port occupied: use `PORT=3100` on the host or `API_PORT=3100` with Compose.
- Cookie not sent cross-site: HTTPS + Secure + SameSite=None, exact CORS allowlist, and frontend credentials are all required.
- Old PostgreSQL data: do not mount a PG17 volume into PG18. Keep it for recovery and use the new Compose volume.
- Multiple app instances: the in-memory rate limiter is per process; replace its store with shared infrastructure when horizontal scaling becomes real.

## Structure

```text
backend/
├── prisma/                 # schema, seed, committed migrations
├── scripts/                # DB guard, generator, secrets, smoke
├── src/
│   ├── config/             # validated environment
│   ├── infrastructure/     # database, logging, OpenAPI
│   ├── integrations/       # provider-neutral extension points
│   ├── modules/            # health, auth, users, future features
│   ├── shared/             # errors, HTTP, security, types
│   ├── app.ts              # Express composition, no listen
│   └── server.ts           # HTTP lifecycle and shutdown
├── tests/                  # setup, helpers, unit, integration
├── requests/               # REST client examples
└── docs/                   # architecture, development, deployment, recipes
```
