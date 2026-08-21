# Architecture

## Why a modular monolith

This backend is a modular monolith: one Express process and one PostgreSQL database, organized by
business capability. This keeps local development, deployment, transactions, and debugging simple
during a hackathon while preventing unrelated features from accumulating in global route or utility
files. A feature can later be extracted only when there is measured operational or ownership pressure.

The current design deliberately avoids microservices, CQRS, event sourcing, Kubernetes, Kafka,
Redis, GraphQL, a generic repository layer, and a dependency-injection container.

## Request flow

```text
HTTP request
  -> trust proxy and request ID
  -> structured request logging
  -> payment webhook raw-body registration point
  -> Helmet and CORS
  -> body parsers and rate limits
  -> route and authentication/authorization middleware
  -> Zod validation
  -> controller
  -> service
  -> Prisma/PostgreSQL or a provider-neutral integration
  -> { data: ... }

Any failure
  -> Express 5 Promise error forwarding
  -> central error mapper
  -> { error: { code, message, details?, requestId } }
```

`src/app.ts` assembles the Express application but never listens on a port, so Supertest can import
it directly. `src/server.ts` owns the HTTP server, startup, future realtime attachment point, and
graceful shutdown.

## Layer responsibilities

- `feature.routes.ts` mounts endpoints and route-specific middleware. It contains no business logic.
- `feature.controller.ts` translates HTTP input/output and calls the service. Controllers stay thin.
- `feature.service.ts` contains business rules, transactions, and direct Prisma calls.
- `feature.schema.ts` contains Zod request/response schemas and OpenAPI metadata.
- `infrastructure/` owns database, logging, and OpenAPI wiring.
- `shared/` contains small cross-feature HTTP, error, security, type, and utility primitives.
- `integrations/` contains provider-neutral contracts. Vendor SDKs belong in adapters only after a
  product requirement selects a provider.

A repository layer is optional and should only be introduced for a feature with a concrete need. Do
not add `BaseController`, `BaseService`, `BaseRepository`, or pass-through abstractions.

## Configuration and database rules

Application code reads validated values from `src/config/env.ts`; it must not read `process.env`
directly. `prisma.config.ts` is the intentional exception because Prisma CLI starts outside the
application lifecycle.

Prisma Client and the `pg` pool are process singletons. Services may call Prisma directly, select only
the fields they return, and use a transaction when several writes form one state transition. Schema
changes require a checked-in migration:

```bash
npm run db:migrate -- --name describe_the_change
```

Use `prisma migrate dev` locally and `prisma migrate deploy` in tests and deployment. Do not use
`prisma db push` in the shared development workflow. Secrets, `passwordHash`, and `tokenHash` never
belong in API output or logs.

## Error flow

Expected failures use `AppError` with an HTTP status, stable machine-readable code, safe message, and
optional validation details. The central handler maps Zod errors, authentication and authorization
errors, 404s, rate limiting, Prisma `P2002`/`P2025`, and unknown errors. Unknown database messages are
never returned. Every error response includes the request ID; production responses do not include a
stack trace.

## Authentication flow

Registration and login issue a short-lived access token and a refresh token signed with different
secrets. Access middleware validates signature, issuer, audience, expiry, and `type=access`, then sets
typed `req.auth` data.

Only the SHA-256 hash of a refresh token is stored. Refresh validates `type=refresh`, looks up the
session by `jti`, compares the hash, verifies expiry/revocation, and atomically revokes the old session
while creating a new one. Conditional update semantics prevent two concurrent refresh requests from
both succeeding. Logout revokes one session; logout-all revokes every active session for the user.

Refresh delivery is exclusively either an HttpOnly cookie or a JSON body, selected at startup. Cookie
mode limits the cookie path to auth endpoints and uses environment-controlled Secure, SameSite, and
Domain attributes.

## Extension points

- AI: generation and streaming-capable contracts with timeout/`AbortSignal` support.
- Storage: private object operations and signed URLs with server-side upload validation.
- Payments: checkout creation, idempotency, and signature-verified raw-body webhooks.
- Realtime: user/room publishing and an attachment point on the HTTP server.
- Location: validated coordinates and Haversine distance; PostGIS only when spatial queries justify it.
- Background jobs: add a queue only for durable or long-running work.

See `docs/recipes/` for adoption criteria and security rules. No provider SDK or queue infrastructure
is installed before the product topic requires it.
