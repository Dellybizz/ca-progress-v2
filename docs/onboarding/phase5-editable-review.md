# Phase 5 — Editable review and workspace handoff

The ready screen now has labelled Edit actions for level, attempt, applicable groups, preparation, support preferences and daily goal. Editing returns directly to review after saving. Level or attempt changes request only the academic prerequisites they invalidate; preparation, preferences and goal stay intact. Foundation continues to skip groups.

Edits keep a separate snapshot of the reviewed choices. Back and Cancel edit discard the whole edit session, including dependent choices, without writing a draft. Save changes validates the complete revised review and uses the existing account-scoped revision check in one request. Failed saves stay in the editor; stale revisions offer reload rather than overwriting another device. Unconfirmed edit sessions are held in memory; persistent offline drafts remain Phase 6.

Finish stays disabled offline and reports an error if server confirmation fails. Requests have a 20-second timeout; unreadable replies and missing acknowledgements remain retryable without showing false success. A successful response locks the choices and shows a saved/opening state while navigation proceeds, with a workspace button if needed. Completion retains Phase 4's atomic writes and already-completed no-op: retrying a lost response cannot overwrite study data or reset onboarding. An account completed on another device also exits safely from a draft save.

Opening `/onboarding` directly defaults to `/dashboard`; safe explicit study return paths remain respected. External paths, API destinations and authentication/onboarding loops fall back to the dashboard. Ordinary login still respects its existing Today destination. Completed accounts are redirected before loading setup choices.

The public `/onboarding-preview` includes the same editable review without account writes. Shared code remains portable for the native adapter; active native academic entry, persistent offline queues and account handoff are Phase 6, and device/APK certification remains Phase 7.

Validation includes edit dependency/cancel snapshots, live mapping validation, destination safety, accessible summary controls, retained/custom goals and offline finish state, plus the Phase 4 account isolation/atomic rollback/stale revision/completion replay tests. Live preview interaction is checked after the gated release.
