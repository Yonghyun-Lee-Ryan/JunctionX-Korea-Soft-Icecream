# Realtime Recipe

Keep features dependent on a small `RealtimeGateway` abstraction that can publish to a user or room.
Choose WebSocket, Socket.IO, SSE, or a managed service only when the interaction requirements are
known.

`src/server.ts` is the attachment point for a realtime server because it owns the actual Node HTTP
server; `src/app.ts` remains independently testable. Authenticate handshakes using the same access-token
rules and authorize every room join or subscription. Never let a client select another user's channel
without a server-side permission check.

Define event names and payloads with versioned schemas, validate inbound data, cap message size and
frequency, and avoid placing secrets in query strings or logs. Decide whether missed events need
durability; realtime delivery alone is not a queue.

A single hackathon instance can use in-memory connection/room state. Multiple instances require a
shared adapter or managed broker plus sticky-session considerations. Presence, replay, ordering, and
delivery guarantees should be added only when the product needs them.
