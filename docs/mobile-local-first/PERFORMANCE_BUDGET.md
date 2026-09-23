# Native performance, storage and reliability budget

Budgets apply to representative mid-range Android hardware and a five-year student dataset. Release tests must report p50 and p95; a regression beyond a hard limit blocks promotion unless this record is explicitly revised.

| Measure | Target | Hard limit |
|---|---:|---:|
| Cold start to cached shell | 600 ms p50 | 1,200 ms p95 |
| Cold start to useful cached screen | 900 ms p50 | 1,800 ms p95 |
| Warm resume to interactive | 250 ms p50 | 500 ms p95 |
| Local route transition | 100 ms p50 | 250 ms p95 |
| SQLite list query | 40 ms p50 | 100 ms p95 |
| First foreground sync batch | 2 s p50 | 5 s p95 on healthy network |
| Community event visible after receipt | 100 ms p50 | 300 ms p95 |
| Main-thread long task | none over 100 ms | no task over 250 ms |

## Storage

- Core structured data target: 50 MB; warn at 100 MB; hard managed ceiling 250 MB per account.
- Recent community default: 90 days or 100,000 messages, whichever comes first; pinned/saved references retain required records.
- Resource files are opt-in downloads with a user-visible quota, default 500 MB; never evict an open or pending-upload file.
- Tombstones and applied idempotency receipts remain at least 30 days and longer than maximum supported offline duration.
- Compaction is transactional, cancellable and based on server-confirmed cursors. Users can inspect and clear downloaded files without deleting authoritative server data.

## Reliability

| Invariant | Required result |
|---|---|
| App starts offline | cached shell and last data render; no blocking network loader |
| Process killed during pull | cursor and partial batch roll back together |
| Process killed during push | stable idempotency key makes retry safe |
| Realtime gap | pause cursor, pull missing range, resume |
| Network flaps | bounded exponential backoff with jitter; foreground action can retry |
| Schema upgrade fails | retain previous database, show recoverable state, send no mutations |
| Seven days offline | all supported core reads work; queued writes remain attributable |
| Account switch | zero cross-account rows/files visible |

Operational targets are 99.9% crash-free sessions, 99% successful sync cycles on a healthy network, and zero acknowledged mutation loss. Telemetry records timings, counts and error classes without private content.
