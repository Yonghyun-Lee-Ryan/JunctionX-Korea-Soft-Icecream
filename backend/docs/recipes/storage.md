# Object Storage Recipe

Depend on a provider-neutral `ObjectStorage` contract with `put`, `delete`, and `getSignedUrl`.
Implement S3, R2, Supabase Storage, Cloudinary, or another adapter only after the product chooses one.
Do not persist uploads on the API container filesystem.

Before accepting an upload:

- enforce a per-use-case byte limit;
- allowlist MIME types and verify content where practical, not only the client-provided header;
- normalize the display filename but generate an opaque server-side object key;
- reject path traversal, control characters, double extensions, and unsupported content;
- authorize the owning user/resource before issuing a signed URL;
- keep buckets private and use short-lived signed URLs.

Prefer direct-to-storage signed uploads for large files. Store object key, size, MIME type, owner, and
status in PostgreSQL; do not store a permanent signed URL. Make cleanup idempotent and handle the case
where a DB write succeeds but upload finalization fails. Add malware scanning or image transcoding when
the threat model or public sharing requires it, usually through a background job.
