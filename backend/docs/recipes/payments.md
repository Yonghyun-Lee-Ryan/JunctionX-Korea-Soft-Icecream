# Payments Recipe

Do not install a payment SDK before a provider and checkout flow are selected. Business code depends
on a `PaymentProvider` concept that creates a checkout/session and maps provider state into local
payment state.

Never trust amount, currency, product, discount, or user identity supplied by the client. Recalculate
them from server-owned data. Supply a stable idempotency key for checkout creation and persist it with
the local order/payment attempt.

## Webhooks

Payment signatures usually cover the exact raw request bytes. Register the provider webhook and its
raw-body parser at the explicit hook in `src/app.ts` before the global JSON parser. Verify the signature
and timestamp before parsing or acting on the event.

Persist the provider event ID with a unique constraint, then update local state transactionally so a
retry cannot apply the same event twice. Return quickly after durable acceptance; move slow email,
fulfilment, or reconciliation work to a background job. Do not log signatures, secrets, payment
credentials, or full sensitive payloads.

The redirect/callback from a browser is not proof of payment. Final state must come from a verified
webhook or a server-to-server provider query. Model refunds, failures, cancellations, and out-of-order
events explicitly before production use.
