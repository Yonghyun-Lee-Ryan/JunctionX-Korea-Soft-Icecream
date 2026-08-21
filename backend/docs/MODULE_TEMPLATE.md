# Module Template

Generate a feature skeleton from `backend/`:

```bash
npm run generate:module -- orders
```

The generator accepts a safe kebab-case, camelCase, or PascalCase name, normalizes it, rejects invalid
names, and refuses to overwrite an existing module. For `orders` it creates:

```text
src/modules/orders/orders.routes.ts
src/modules/orders/orders.controller.ts
src/modules/orders/orders.service.ts
src/modules/orders/orders.schema.ts
tests/unit/orders.service.test.ts
```

It prints the exact registration lines rather than modifying the central router with fragile string
replacement. Add the reported equivalent to `src/routes.ts`:

```ts
import { ordersRouter } from './modules/orders/orders.routes.js';

router.use('/api/v1/orders', ordersRouter);
```

## Responsibilities

- Schema: define strict Zod input/output schemas, inferred types, examples, and OpenAPI metadata.
- Service: implement business rules and direct Prisma queries; use transactions for atomic state
  changes and return only public fields.
- Controller: translate validated HTTP data to a service call and return `{ data: ... }`.
- Routes: declare paths and compose validation/auth/role/rate-limit middleware.
- Tests: cover service rules with unit tests and the HTTP/DB behavior with integration tests.

Add files only when the feature needs them. Do not introduce generic base classes or an unconditional
repository layer.

## Completion checklist

1. Mount the router under `/api/v1`.
2. Keep routes and controllers free of business logic.
3. Reuse the Zod schemas for request validation and OpenAPI registration.
4. Add success/error examples and bearer security metadata where applicable.
5. Add migrations when the Prisma schema changes; never substitute `db push`.
6. Ensure `passwordHash`, `tokenHash`, secrets, and internal DB errors cannot leave the module.
7. Add unit and integration tests, including authorization and failure cases.
8. Add an example to `requests/api.http` when the endpoint is useful during manual development.
9. Update architecture or recipe documentation if the feature introduces a new integration pattern.
10. Run `npm run verify`.
