# AI Integration Recipe

Do not install an AI vendor SDK until the product topic selects a provider. Keep application services
dependent on an `AiProvider` contract and put vendor-specific authentication, request mapping, and
error translation in one adapter.

The contract should support a normal generated result and leave room for streaming, accept an
`AbortSignal`, and enforce a timeout. Propagate cancellation when the HTTP client disconnects. Use SSE
or another explicitly selected transport for streaming and respect backpressure rather than buffering
an unbounded response.

Rules:

- API keys exist only in validated server configuration; never return or embed them in frontend code.
- Validate prompts, model options, input size, file references, and output shape with Zod.
- Set timeouts, bounded retries with jitter, and request/cost limits. Do not retry permanent 4xx errors.
- Redact prompts or model output when they can contain personal or sensitive data.
- Treat model output as untrusted input before rendering HTML, executing tools, or writing to the DB.
- Move work to a durable background job when it can outlive an HTTP timeout or must survive restarts.
- Record provider request IDs, latency, token/cost metadata, and internal correlation IDs without keys.

Prefer dependency injection at the feature boundary through a simple factory or constructor argument;
a general DI container is not needed.
