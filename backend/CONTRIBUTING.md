# Contributing

Assume `main` is protected. Create a focused branch from the latest main branch:

- `feat/order-checkout`
- `fix/refresh-race`
- `chore/backend-tooling`

Use Conventional Commits, for example `feat(auth): add logout-all endpoint`, `fix(db): make refresh
rotation atomic`, or `docs: explain cookie transport`. Keep pull requests small and do not mix frontend
or unrelated cleanup into a backend change.

## Development rules

- Run backend commands from `backend/` with Node.js 24 and npm.
- Organize features under `src/modules/<feature>` with thin routes/controllers and business logic in
  services.
- Validate HTTP input with Zod and reuse those schemas in OpenAPI.
- Import validated configuration; do not read `process.env` in application modules.
- Never return or log passwords, hashes, tokens, cookies, secrets, or database URLs.
- Do not add a vendor SDK, Redis, queue, or other infrastructure until a concrete feature needs it.
- Preserve existing user changes and do not edit frontend or unrelated repository areas without scope.

## Database changes

Every Prisma schema change must include a reviewed migration generated with:

```bash
npm run db:migrate -- --name concise_change_name
```

Use `migrate deploy` in tests and deployment. Do not use `prisma db push` as the shared development
workflow, rewrite an already shared migration, or commit production data. Keep seed logic idempotent and
credentials environment-driven.

## API changes

New or changed endpoints must include:

- Zod request/response schemas and safe examples;
- OpenAPI path registration and bearer security metadata when authenticated;
- unit tests for business rules and integration tests for HTTP/real PostgreSQL behavior;
- common `{ data }` success and `{ error }` failure shapes;
- `requests/api.http` or documentation updates when manual usage changes.

## Before opening a pull request

```bash
npm run verify
git diff --check
```

Confirm the migration is included when applicable, generated artifacts/build output are not staged,
`.env` and credentials are absent, and the PR description explains behavior, test evidence, migration
impact, and any deployment configuration. Request review and merge through the protected-main workflow;
do not force-push shared branches.
