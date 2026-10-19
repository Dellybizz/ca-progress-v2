# Workspace contracts — version 1 design freeze

Status: Phase 0 implementation contract. These shapes are **not yet production API handlers or D1 migrations**. Existing `/api/notes`, `/api/v1/*`, native repository and upload routes remain authoritative until their additive adapters ship. No parallel production backend is introduced.

## Identity and content

| Entity | Required contract |
|---|---|
| File entry | `id`, authenticated `ownerId`, `kind`, `parentFolderId|null`, `title`, `createdAt`, `updatedAt`, `revisionId`, `lifecycle`, `classification`, `academicLinks[]`, `sourceLineage|null` |
| Folder | Stable entry ID, parent ID, owner, revision. No cycles, cross-owner parents or deletion while nonempty. A subject is a classification, not a physical folder. |
| Notebook | Stable entry ID; ordered section/page IDs. Pages contain text and ink layers; order changes do not recreate page IDs. |
| Owned copy | Distinct ID and owner; source snapshot/share provenance; inherited read-only/no-export restrictions. Copy does not imply edit permission. |
| Publication | Frozen snapshot ID, publisher, original/source ID, content hash and frozen share-time capabilities; never the mutable working document. |
| Attachment/object | Stable object ID, storage class/key, actual MIME/bytes/hash, processing state, revision and policy. Never persist an expiring signed URL as identity. |
| Revision | ID, entry ID, parent IDs, schema version, base/checkpoint reference, delta reference/hash, creator/device/operation, ordering confidence and retained-branch state. |

Kinds: `uploaded-file`, `document`, `notebook`, `annotated-pdf`, `official-reference`. Lifecycle: `active`, `trashed`, `purge-pending`, `purged`. Processing: `pending-upload`, `quarantined`, `processing`, `ready`, `unsupported`, `failed`. Lifecycle and processing are independent; a failed preview must not delete an owned file.

Typed content envelope:

```json
{
  "schemaVersion": 1,
  "entryId": "document-id",
  "revisionId": "revision-id",
  "kind": "document",
  "engine": "tiptap",
  "engineSchemaVersion": 1,
  "content": {"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"block-id"}}]},
  "attachmentIds": [],
  "sourceAttribution": null
}
```

Engine/node allowlists and attributes are explicitly versioned. Stable IDs are generated once during import/creation and retained on movement. Engine JSON is validated by a shared node schema and bounded parser before persistence. Arbitrary JSON or HTML is not trusted merely because the client editor produced it. Legacy `{version:1,format:"html",html:...}` is a separate legacy format; do not reinterpret its version number as the new envelope.

Notebook pages use stable page IDs, dimensions/coordinate units, background/template settings, and ordered layer references. Stroke objects contain ID, point/pressure/time samples, brush settings, transforms and policy. Store bounded batches/chunks with checkpoints; no whole-notebook base64 blob in D1. PDF sidecars identify the original PDF hash/revision, page index/geometry/rotation and annotation objects. Replacing a source requires explicit re-anchor/derivative handling.

## Permissions and inheritance

Effective rights are computed on the server from ownership, frozen share grants, source lineage, moderation/academic boundaries and active authorization routes. A client-supplied owner or capability flag is never authority.

Capability names: `view`, `editPersonalVersion`, `savePrivateCopy`, `tagToChapter`, `reshareOriginal`, `publishPersonalVersion`, `download`, `print`, `export`, `cacheInApp`. Editing a personal version requires permitted saving. A View Only saved copy is read-only. Protected classification inherits through revisions, attachments, thumbnails, extracted text, annotations and indexes. Restriction removal is not a client metadata patch.

| State | View | Edit | Raw download/export | Protected internal cache |
|---|---|---|---|---|
| Owned editable unrestricted working file | Owner allowed | Owner allowed | Entitlement/policy checked | Account/device rules |
| Immutable publication | Valid grant | Original never editable | Frozen grant/classification checked | Grant checked |
| Saved View Only personal copy | Lawful copy rights | Denied | Inherited grant/classification | Authorized only |
| Protected/no-export | Authorized viewer only | Only permitted editable personal version | Denied, including derived bytes/keys/backups | Encrypted authorized viewer only |
| Revoked reference without alternate route | Denied on reconciliation | Denied | Denied | Purge shared cache after verified reconnection |

Recipient private versions and alternate authorization routes follow the existing share-graph policy. Protected processing/export must fail closed until the relevant policy gateway is implemented.

## Listing, search and mutations

Listing contract: `{items, page:{nextCursor,hasMore,limit}, counts:{value,scope,accuracy}, schemaVersion}`. Rows contain metadata/excerpts and policy-filtered preview descriptors; opening a document retrieves its content separately. Cursor binds viewer/context, filter/sort/group, deterministic last key and tie-breaking ID. Parameter changes reset continuation. Counts cannot disclose inaccessible content. No artificial claim that a capped first slice is the total library.

Mutation envelope:

```json
{
  "schemaVersion": 1,
  "operationId": "unique-idempotency-id",
  "deviceId": "authenticated-device-id",
  "contextKey": "academic-context-version",
  "entryId": "stable-local-or-server-id",
  "baseRevisionId": "known-revision-or-null-for-create",
  "dependencies": [],
  "clock": {"localOccurredAt":"ISO-time","serverOffsetMs":null,"confidence":"uncertain"},
  "operation": "update-document",
  "payload": {}
}
```

The authenticated session supplies user identity. Idempotency receipts bind account + operation ID + payload hash; reused ID/different payload is a conflict. Device clocks alone do not prove edit order. Server acknowledgements return accepted revision, durable receipt and processing/backup state. Local durability is a separate local receipt issued only after the local transaction commits. No success from an empty/malformed 2xx response.

Reliable actual ordering follows the approved latest-edit rule. Unorderable concurrent branches retain both and show their last confirmed common revision in the normal editor. History comparison is on demand; unresolved branches cannot be pruned by retention. Document coediting is a separate contract, not an implicit replacement of this personal-document policy.

Upload session: stable session ID, owner, source descriptor/hash/size, quota reservation, permitted parts/offsets, expiry and lifecycle. Finalization verifies bytes, policy and accounting before a single logical entry/receipt becomes visible. Direct uploaded bytes are not proof of verified cloud backup. Queue/part retry is idempotent; upload failure retains the local source and recoverable intent.

Error families: `INVALID_CONTENT`, `DOCUMENT_TOO_LARGE`, `REVISION_CONFLICT`, `CONTEXT_CHANGED`, `PERMISSION_REVOKED`, `QUOTA_EXCEEDED`, `LOCAL_STORAGE_FULL`, `UPLOAD_EXPIRED`, `PROCESSING_UNSUPPORTED`, `RETRYABLE_SERVICE_FAILURE`. Errors include retryability and a recovery action without leaking another user's state. Routine sync stays invisible; actionable permanent blockers accurately say local save is not cloud backup.

## Storage and compatibility

Extend existing metadata/blob/outbox structures after migration review. Candidate tables: folder relations, entry/source links, versioned document heads, revisions/deltas/checkpoints, capability grants, processing artifacts and durable transfer/outbox receipts. Do not allocate a migration number before inspecting the current branch. The audited latest migration is `0094_onboarding_setup_v2.sql`.

A transaction covers document head, content/reference metadata and revision/outbox receipt where possible. R2 and D1 cannot share one atomic transaction: use explicit staged state, outbox and idempotent repair. Never delete bytes in an exception path after a committed entry without checking reachability and operation receipt.

Browser: account/context-scoped IndexedDB, existing queue migration, per-origin quota limitations. Native: existing SQLite/vault, account-scoped keys and persisted OS jobs; offline assets in APK. Do not send protected bytes to general local backup or retain them in accessible external storage. Larger-file support requires native memory/streaming measurements.
