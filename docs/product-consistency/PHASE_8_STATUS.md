# Product Consistency Phase 8 — Admin control centre

Status: implemented; production deployment is required before completion.

## Delivered

- Plain-language system health and recovery entry points.
- A single operator directory covering academic data, exam attempts, ICAI Sync, resources, accounts, plans, community, notifications and audit history.
- Capability-scoped, idempotent draft/publish/restore configuration actions.
- Append-only configuration versions and immutable privileged audit history.
- Search and state filters, student-context preview entry point, and progressive disclosure of JSON/error detail.
- Read-only plan and notification operations; granular plan policy editing remains Phase 9.

## Safety

- No existing production table or stable identifier is replaced.
- Publishing moves a pointer to an immutable version and can restore an earlier version.
- Mutations validate bounded input, use actor-scoped idempotency keys and commit their audit row in the same D1 batch.
