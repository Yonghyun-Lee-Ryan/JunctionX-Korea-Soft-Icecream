# Background Jobs Recipe

No Redis or queue library is installed initially. Keep work synchronous when it reliably completes
within the HTTP timeout and does not need restart durability.

Add a durable queue when one or more conditions apply:

- AI generation or external processing can take longer than an HTTP request;
- image/video/file transformation must survive API restarts;
- payment fulfilment must retry safely after a verified webhook;
- work needs scheduled execution, concurrency control, or independent scaling;
- losing an in-memory task would create incorrect user-visible state.

Before choosing a queue, define job payload versions, idempotency keys, retryable errors, exponential
backoff, maximum attempts, timeouts, cancellation, and dead-letter/recovery operations. Store references
to large inputs rather than embedding secrets or blobs. Workers must re-check authorization-relevant
state and make side effects idempotent.

Expose job status through persisted application state when users need progress. Log job ID, request ID,
attempt, duration, and safe failure code; never log credentials or full sensitive payloads. Add health,
metrics, and an operational retry procedure together with the worker.
