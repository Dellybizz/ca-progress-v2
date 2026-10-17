# Mobile security boundaries

## Authorities and trust

The installed bundle and device database are untrusted from the server’s perspective. Every request is authenticated, authorized and validated again. D1 owns users, academic truth, entitlements, billing, moderation and sync ordering. R2 is private. Durable Objects coordinate realtime delivery but do not bypass D1 authorization.

| Data/capability | Device location | Server rule |
|---|---|---|
| Native session token | Keystore/Keychain secure storage only | store hash; rotate/revoke; bind to device/build |
| Cached student data | account-partitioned SQLite | filter every bootstrap/delta by authenticated owner |
| Pending mutation | SQLite outbox, no credentials | stable idempotency key; authorize on every retry |
| Resource file | app-private filesystem | signed, short-lived download; entitlement checked first |
| Payment/entitlement | display cache only | server is final authority; no offline grants |
| Community moderation | display cache only | server validates visibility and moderation state |

## Required isolation

- Database and file namespaces include the stable account ID; logout locks or removes that partition.
- Account switching closes the old database before opening another and cancels in-flight work.
- Logs contain request correlation IDs, not tokens, note bodies, chats, payment payloads or signed URLs.
- TLS is mandatory. Deep links use verified App/Universal Links and an allowlist; OAuth tokens never appear in a URL.
- Rooted-device and screenshot controls may reduce exposure but are not authentication controls.
- Export and account deletion remain server-mediated and auditable.

## Import enforcement

`npm run audit:mobile:boundaries` rejects mobile/shared-client imports of Next server modules, `server-only`, OpenNext/Cloudflare runtime bindings, API/admin implementation modules and D1 access. It also rejects known server-secret reads. CI must run `test:mobile:phase13` before native packaging. This complements, rather than replaces, bundle inspection and server-side authorization tests.

## Threat-driven acceptance checks

Test expired/revoked tokens, replayed exchange codes and idempotency keys, cross-account cursor use, guessed R2 keys, forged entitlement data, cursor gaps, malicious HTML, unsafe external links, database migration failure, logout during sync, and restored device backups. A failed security or schema compatibility check must preserve readable local data and stop unsafe pushes.
