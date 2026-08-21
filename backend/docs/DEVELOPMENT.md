# Development

## Prerequisites

- Node.js 24 LTS (`nvm install && nvm use` or another version manager)
- npm as shipped with Node.js 24
- Docker with Docker Compose

Run backend commands from `backend/`. Copy the example environment file once and keep local secrets
untracked:

```bash
cp .env.example .env
```

Generate new JWT secrets with `npm run secret:generate`. The example values are for local development
only.

## Run the API on the host

```bash
docker compose up -d db
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The host `DATABASE_URL` uses `localhost`. Seeding creates an admin only when both
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set.

## Run everything in Docker

```bash
docker compose up --build
```

Follow logs with `npm run docker:logs` or `docker compose logs -f api`. Stop containers with
`npm run docker:down`. A named PostgreSQL volume preserves local data.

## Database changes

Edit `prisma/schema.prisma`, then create and review a migration:

```bash
npm run db:migrate -- --name add_order_status
npm run db:generate
git diff -- prisma/schema.prisma prisma/migrations
```

Commit the schema and migration together. Development uses `migrate dev`; CI, tests, and releases use
`npm run db:migrate:deploy`. Never use `db push` as the normal shared-branch workflow. Run the optional,
idempotent seed explicitly with `npm run db:seed`.

## Test database

Tests use `TEST_DATABASE_URL`, never the development `DATABASE_URL`. The preparation script switches
the process database URL explicitly, rejects a database name that is not clearly a test database (for
example, one ending in `_test`), and applies checked-in migrations with `migrate deploy`:

```bash
npm run db:test:prepare
npm test
```

Integration helpers delete only known test tables in foreign-key-safe order. Vitest database tests
run serially so shared state cannot race. Do not weaken these safeguards to make a local URL work;
create a correctly named test database instead.

Useful test commands:

```bash
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage
```

Coverage is diagnostic at this stage and has no intentionally high blocking threshold.

## Quality checks

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run verify
```

`verify` validates and generates Prisma Client, checks formatting and lint, type-checks, runs unit and
integration tests, and produces the production build. Run it before every pull request.

TypeScript is strict ESM with NodeNext resolution. Relative TypeScript imports use the emitted `.js`
extension. Do not add path aliases unless there is a demonstrated need.

## Debugging and logs

- Set `LOG_LEVEL=debug` locally for more detail. Production logs remain structured JSON.
- Request logs include request ID, method, path, status, and response time.
- Send `X-Request-Id` when correlating a frontend report with backend logs.
- Never add passwords, authorization/cookie headers, tokens, secrets, or connection URLs to log data.
- Check database state with `npm run db:studio`; do not edit migration history already shared.
- Check container state with `docker compose ps` and database logs with `docker compose logs db`.

Environment values are validated once in `src/config/env.ts`. Application modules must import that
validated configuration rather than access `process.env`. Prisma CLI configuration is the documented
exception.

## Adding a feature

```bash
npm run generate:module -- orders
```

Then register the router, implement schemas/service/controller, register OpenAPI paths, and add tests.
See `docs/MODULE_TEMPLATE.md` for the checklist.
