# Backend agent guide

This directory is a Node.js 24, npm, strict TypeScript ESM backend. Imports use NodeNext-compatible `.js` extensions.

## Implementation rules

- Organize business capabilities under `src/modules/<feature>` as routes, controller, service, and schema files. Add files only when the feature needs them.
- Keep controllers thin, routes declarative, and business logic plus Prisma access in services. Do not introduce generic base controllers, services, repositories, or a DI container.
- Do not read `process.env` outside `src/config/env.ts`. Prisma CLI configuration, executable scripts, and test bootstrap are documented exceptions because they run before the app config can load.
- Validate request input with Zod. Use the same Zod schemas in OpenAPI registration so runtime behavior and documentation remain synchronized.
- Preserve success responses as `{ "data": ... }` and errors as `{ "error": { "code", "message", "details", "requestId" } }`.
- Never return `passwordHash` or `tokenHash`. Never log passwords, tokens, secrets, cookies, authorization headers, database URLs, or hashes.
- A Prisma schema change requires a migration from `npm run db:migrate -- --name <name>`. Do not use `prisma db push` in the shared development flow.
- Every new or changed endpoint needs integration tests and OpenAPI documentation. Add focused unit tests for business rules.
- Run `npm run verify` before declaring work complete.

## Scope control

- Keep integrations in `src/integrations` provider-neutral until the hackathon topic selects a provider.
- Do not install speculative AI, storage, payments, realtime, geospatial, queue, Redis, or cloud SDKs.
- Do not add microservices, CQRS, event sourcing, Kafka, Kubernetes, GraphQL, or Redis without an explicit product requirement.
