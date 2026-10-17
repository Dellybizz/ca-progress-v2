# Mobile Phase 8 — Resources, Documents and Downloads

Baseline: Mobile Phase 7, rooted in production commit `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Added a responsive in-app viewer for private and approved Community PDFs and images. Unsupported office formats keep an explicit secure-download fallback.
- Reused the existing owner/moderation authorization route and short-lived R2 URLs. The viewer never stores signed URLs in snapshots or IndexedDB.
- Made preview and download disposition explicit in the signed R2 request. Filenames are bounded and stripped of header-breaking characters.
- Added account-isolated offline-file lookup to the viewer. A saved PDF or image opens from IndexedDB without bypassing its original account boundary.
- Added upload progress and cancellation while retaining direct browser-to-R2 transfer, server-side quota reservation, MIME/size verification and moderation.
- Routed ICAI resource cards through the existing verified official-resource redirect so broken, stale or non-ICAI destinations fail closed.
- Added Resources as a distinct mobile capability with a truthful partial-offline policy.

## Security and data boundaries

- No new public bucket, proxy upload or duplicate resource database was added.
- Private and Community files still require owner access or approved shared visibility.
- Offline files remain capped by the Phase 6 per-file and per-device limits and are cleared per account.
- Upload bytes still bypass the application Worker; only the signed descriptor and verified metadata pass through it.
- No D1 or R2 migration is required for Phase 8.

## Deferred by phase boundary

- Community realtime, presence and push delivery: Phase 9.
- Mobile billing and store policy: Phase 10.
- Capacitor packaging and store submission: Phase 11.
- Release automation and staged rollout: Phase 12.

Production deployment remains excluded until explicitly authorized.
