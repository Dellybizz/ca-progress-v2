# CA Progress V2 scenario decisions

Scope: website and APK scenarios. Onboarding and payment scenarios are excluded. Approved decisions below are policy specifications, not claims of implementation.

## S0-001 — Student accidentally deletes important data

- Decision date: 2026-10-13
- Product owner selection: **B — 30-day recycle bin**
- Policy: Deleting an eligible note, study record, planner task, or other recoverable item moves it to Trash rather than immediately permanently erasing it. The student can restore it for 30 days.
- Remaining questions: Eligible data types; precise expiration and final purge rules; offline and multi-device synchronization; permissions; administrative retention exceptions. Linked student-owned container deletion is addressed in S0-002.
- Status: Approved for product specification; implementation not yet verified.

## S0-002 — Student deletes a folder containing other items

- Decision date: 2026-10-13
- Product owner selection: **B — Move folder and all contents to Trash for 30 days**
- Trigger: A student deletes a student-created folder or collection containing linked notes, PDFs, tasks, or other eligible contents.
- Policy: Move the parent folder and its eligible contents together into Trash for a 30-day recovery window. Restoring the folder restores the contents together, preserving their structure and relationships.
- Scope guardrail: Official ICAI syllabus records and independent academic progress must not be deleted through a student-created folder deletion.
- Remaining questions: Handling links/shared references outside the folder; conflicting offline edits during deletion/restoration; nested folders and partially expired child items; final purge schedule; confirmation UI; retention exceptions.
- Status: Approved for product specification; implementation not yet verified.

## S0-003 — Automatic Trash expiration after 30 days

- Decision date: 2026-10-13
- Product owner selection: **A — Automatic deletion without warning**
- Trigger: An eligible item remains in Trash when its 30-day recovery window ends.
- Policy: Permanently delete the expired item automatically after 30 days, without an additional reminder, warning, or confirmation request.
- Relationship to earlier decisions: S0-001 and S0-002 provide the 30-day Trash window and recovery for eligible data, including deleted student-created folders and their contents. This decision defines the end-of-window behavior.
- Remaining questions: Expiration timestamp/timezone and processing cadence; behavior for legal retention or disaster-recovery backups; nested-item expiration and restoration edge cases; treatment of offline devices that reconnect after purge.
- Status: Approved for product specification; implementation not yet verified.

## S0-004 — Student-initiated permanent deletion before Trash expiry

- Decision date: 2026-10-13
- Product owner selection: **B — Allow permanent deletion with confirmation**
- Trigger: A student wants to permanently remove eligible items from Trash before the normal 30-day expiry.
- Policy: Provide **Delete Permanently** for individual eligible items and **Empty Trash** for all eligible Trash items. Both actions require a clear confirmation popup informing the student that the content cannot be restored through Trash.
- Relationship to earlier decisions: S0-001 and S0-002 still move eligible deleted data to Trash by default; S0-003 still removes expired items automatically after 30 days without a further warning.
- Guardrails / pending details: Permanent deletion is limited to items the authenticated student is authorized to erase. Official ICAI academic source records or independently protected records are not made deletable by this decision. Offline execution, server-confirmation, duplicate requests, cascading deletion, backups/legal retention, and failure messaging must be defined during implementation; do not falsely display successful permanent deletion before it is committed.
- Status: Approved for product specification; implementation not yet verified.

## S0-005 — Editing a trashed item is recovery

- Decision date: 2026-10-13
- Product owner selection: **Custom rule — edit means recovery**
- Trigger: An authorized student edits an eligible item that was moved to Trash on another device while this device was offline, and the edit subsequently syncs.
- Policy: Treat the valid edit as an intent to **restore the original item**. Restore the same item from Trash to its active location and apply the edit; do not create an unnecessary separate recovered copy or silently discard the edit. Reflect the restored and updated state on other devices.
- Safety / scope: Editing cannot resurrect an item that was already permanently erased through S0-003 or S0-004; the handling of unsynced edits encountered after permanent purge remains open for a separate decision. Keep access checks, duplicate-event protection, and sync auditability.
- Status: Approved for product specification; implementation not yet verified.

## S0-006 — Concurrent offline edits of the same active record

- Decision date: 2026-10-13
- Product owner selection: **A — Latest edit wins**
- Trigger: A student edits the same active note or eligible record independently on two offline devices, which later synchronize.
- Policy: The version corresponding to the **most recently made edit** becomes the authoritative current version. It supersedes the earlier version; no automatic content merge or mandatory conflict-selection popup is required by this decision.
- Important distinction: **Latest edit time**, not **first sync arrival time**, is the decision criterion. How to establish reliable edit ordering despite incorrect device clocks is pending in S0-007.
- Scope: Concurrent edits to the same active note or single eligible record. This does not override S0-005 (edit of an item in Trash counts as restoration), S0-003/S0-004 (permanent deletion), or transaction-specific safeguards for files, counters and academic history.
- Open details: Reliable edit timestamp ordering; exact ties; how to identify stale/clock-skewed offline devices; whether previous versions remain recoverable; reporting a superseded local edit.
- Status: Approved for product specification; implementation not yet verified.

## S0-007 — Incorrect device clocks during offline edit conflicts

- Decision date: 2026-10-13
- Product owner selection: **B — Correct using server time**
- Trigger: Two devices independently edit an eligible record while offline, and at least one device has an incorrect clock or edit-order timestamps may be unreliable.
- Policy: When determining the most recent edit under S0-006, use server-synchronized clock offsets and reliable event-ordering metadata **where available** instead of blindly trusting raw device time. If the true order cannot be established reliably, preserve both conflicting versions so that neither is irreversibly lost, and allow resolution rather than falsely assigning a winner.
- Implementation caution: A previous server clock offset is not absolute proof of event order during long offline periods or manual clock changes. Do not resolve uncertain offline edits on raw device timestamps alone; record confidence/conflict state and retain both versions.
- Scope: Eligible edit conflicts. This does not reverse S0-003/S0-004 permanent deletion or override S0-005 recovery of a still-trashed item.
- Remaining technical detail: Accurate conflict detection, order metadata, tie resolution, version retention duration, user interface for uncertain ordering, and cleanup of archived conflict copies.
- Status: Approved for product specification; implementation not yet verified.

## S0-008 — Offline edit after permanent deletion

- Decision date: 2026-10-13
- Product owner selection: **C — Automatically create a new note**
- Trigger: The student permanently deletes a note on one device while another device retains an offline copy, edits it while offline, then reconnects to synchronize.
- Policy: The permanently deleted original remains deleted. Automatically preserve the offline device's new edits as a **separate newly created note** rather than discarding them, prompting for recovery, or reviving the original item.
- Presentation: Make the new recovered note identifiable to the student without requiring a blocking approval step. Its new identity must not reuse the erased original ID.
- Precedence: Unlike S0-005 (edits to an item still in Trash restore the original), this applies only when permanent deletion has already occurred under S0-003/S0-004.
- Safeguards / details to define: Confirm the queued offline content contains genuine edits; ensure one recovered note per unique offline change (idempotency); do not expose permanently deleted content from server storage; preserve edits available on the offline device; handle permanent deletion of folders and non-note record types separately; avoid repeating creation on reconnect/retries.
- Status: Approved for product specification; implementation not yet verified.

## S0-009 — Protect unsynced changes across sign-out

- Decision date: 2026-10-13
- Product owner selection: **Combination of B and D — Warn, offer sync/backup, and retain an encrypted local queue**
- Trigger: A student has unsynced local edits and attempts in-app sign-out, in-app data clearing, or otherwise leaves a device while offline.
- Policy: When an in-app sign-out or data-clearing action risks pending local work, show a clear warning with the number of pending changes and offer **Sync Now** (when online) and **Export Local Backup**. On sign-out, retain pending work in a **secure, encrypted, account-scoped local queue** where supported; resume its sync **only after the same student account signs in again**. Do not silently erase the pending work.
- Account isolation: A different signed-in account cannot read or upload another student's pending changes. Encrypt retained drafts/queue, and manage encryption keys so signed-out state does not expose them.
- Clearing data: Warn before app-controlled destructive clear operations, offer backup/sync, and explain that a deliberate erase of local storage can destroy unsynced records. Do not imply an exported backup is synchronized server data.
- Platform limitation: OS-level uninstall/app-data clearing or browser storage purges cannot reliably be intercepted or prevented; retained encrypted local work may be lost in those cases. Product must not promise survival of these external actions.
- Implementation guardrails: Show pending/synced/failed states accurately; avoid duplicate replay through idempotent operations; handle authorization/session expiry; do not automatically sync the retained queue under another identity. The actual encryption/key-retention approach and backup import format remain to be designed and tested.
- Status: Approved for product specification; implementation not yet verified.

## S0-010 — Local storage full during offline editing

- Decision date: 2026-10-13
- Product owner selection: **A — Display an error**
- Trigger: A student is editing offline and there is insufficient local device storage to safely save a new change.
- Policy: Stop accepting or claiming successful saves that cannot be persisted, and promptly show a clear **Storage Full / Unable to Save** error informing the student that the latest change was not saved. Do not silently delete existing student data or cached files to free space under this rule.
- Relationship to S0-009: Existing safely persisted unsynced data remains protected where technically possible; a new unsaved edit must not appear as safely queued or synced. Avoid falsely describing an in-memory draft as saved.
- Undecided follow-ups: Whether the student should be offered an explicit retry button, export/copy of the currently unsaved text, or a storage-management shortcut; precise thresholds for early warnings. This choice does **not** approve automatic cleanup, forced deletion of existing content, or a promise that unsaved text survives app closure.
- Status: Approved for product specification; implementation not yet verified.

## S0-011 — Automatic retry of failed offline synchronization

- Decision date: 2026-10-13
- Product owner selection: **B — Automatic retry**
- Trigger: Saved offline changes are queued for synchronization but a transient problem (internet disconnection, temporary server outage, timeout or retryable request failure) prevents completion.
- Policy: Keep the changes safely queued on the device and **automatically retry synchronization** when network/server availability permits, without requiring the student to press a manual Retry button. Continue retrying transient failures until successful, including after application restarts where supported.
- Internal status accuracy: Track pending/retrying/synced states accurately without exposing routine synchronization indicators to students (see cross-cutting S0-SYNC-UI-001). Never mark unsynchronized changes as synced internally, erase them because of a retry failure, or create duplicate server writes after retry.
- Implementation guardrails: Use bounded, connection-aware retry with backoff to avoid overloading devices/servers; use operation IDs/idempotent writes. Authentication failure, invalid data, revoked permissions, and other non-retryable responses must not be misrepresented as temporary failures or retried indefinitely; retain affected data safely and surface the blocker.
- Relationship to S0-009: Account-scoped encrypted pending work survives supported sign-outs and resumes retry only after the same account signs in.
- Status: Approved for product specification; implementation not yet verified.

## S0-012 — Partial success when synchronizing offline changes

- Decision date: 2026-10-13
- Product owner selection: **B — Independent synchronization**
- Trigger: Multiple locally saved changes are queued for sync; some requests succeed while others temporarily fail (for example, 15 of 20 changes succeed).
- Policy: Commit and acknowledge **each successful independent change immediately**, while keeping only the unsuccessful changes pending for automatic retry under S0-011. Do not roll back successful independent operations just because another operation failed.
- Background-only presentation: No student-facing sync counts, loading indicators, progress bars, banners or routine synchronization messages. Track successful/pending/failed operation states internally (see S0-SYNC-UI-001).
- Dependency safeguard: Operations that depend on one another must be applied in a safe required order and must not leave inconsistent linked data; an operation requiring a failed prerequisite should remain queued until the prerequisite succeeds.
- Reliability: Track per-operation status, idempotency keys and acknowledgements to prevent duplicate application on retries. Preserve pending changes according to S0-009.
- Status: Approved for product specification; implementation not yet verified.

## S0-SYNC-UI-001 — Invisible background-only synchronization (cross-cutting amendment)

- Decision date: 2026-10-13
- Product owner direction: **Every synchronization must happen in the background; show nothing to the student.**
- Policy: Automatic data synchronization, retries, partial-batch processing, conflict resolution and reconciliation run in the background with **no routine student-facing sync screens, loaders, status counters, success messages, progress bars, toast notifications, or manual synchronization prompts**. Normal student workflow should not be blocked on synchronization.
- Internal engineering requirement: Maintain durable queues, per-operation acknowledgements, safe ordering, idempotency, accurate internal state, retry backoff and failure logs/diagnostics without placing routine sync details in the student's UI.
- Precedence: Overrides previous suggestions in S0-011 and S0-012 to display routine sync status or counts. It does not revoke **S0-009** (explicit warning before signing out or app-controlled clearing when unsynced work is at risk) or **S0-010** (visible error when a change cannot be saved locally); these are data-protection exceptions, not routine sync notifications.
- Failure handling still to decide: If work is persistently unsyncable for a non-transient reason, preserve it and log diagnostics; appropriate escalation must be settled without misleading the student into thinking the work is secure on the server.
- Status: Approved for product specification; implementation not yet verified.

## S0-013 — Dependent offline changes wait for their prerequisite

- Decision date: 2026-10-13
- Product owner selection: **A — Wait and retry in order**
- Trigger: A student creates a folder offline, then creates notes inside it; the folder creation request fails on reconnect.
- Policy: Keep the folder and its dependent notes saved locally. Retry the failed parent-folder creation automatically in the background under S0-011. Only synchronize notes to the server within that folder after the parent exists and is acknowledged by the server.
- Consistency: Enforce dependency ordering for related queued operations, while allowing independent changes to synchronize as approved by S0-012. Do not silently move dependent notes into Uncategorised, cancel their changes, or create duplicates during retries.
- Presentation: All routine retries, operation ordering, and reconciliation are invisible to students under S0-SYNC-UI-001.
- Guardrails: Track stable local-to-server identifiers, operation dependencies and idempotency keys. A permanently rejected prerequisite (such as an authorization failure) must not be endlessly retried; preserve the dependent local data and handle the blocking error according to the separately approved policy.
- Status: Approved for product specification; implementation not yet verified.

## S0-014 — Editing is restricted to students who have current access

- Decision date: 2026-10-13
- Product owner selection: **Custom rule — No access, no editing; renewed access restores editing rights**
- Trigger: A student loses permission to access or edit a file, or later regains that permission.
- Policy: When a student does not have the required file access, they must not be able to modify that file. Editing controls must be disabled/denied according to the current effective permissions, and the backend must reject any unauthorized write. When the student regains the required access, they may edit the file again for their own authorized use.
- Offline security: A device that is offline cannot immediately know about a permission revocation made elsewhere. Offline permission caching and what happens to local drafts made before revocation are NOT resolved by this decision. On reconnection, enforce authoritative permissions; never apply an unauthorized queued edit to the protected file. Decide how to handle the retained unsynced draft separately.
- Deleted records: A file that no longer exists is a different situation from lack of access. S0-008 covers a permanently deleted *note* with an edited offline copy; other missing-file cases require separate rules.
- Presentation: Routine background synchronization remains silent per S0-SYNC-UI-001. The user must not be misled into thinking a denied write changed the server file.
- Status: Approved for product specification; implementation not yet verified.

## S0-015 — Discard offline edits rejected after access revocation

- Decision date: 2026-10-13
- Product owner selection: **A — Discard the edits**
- Trigger: A student edits a shared file offline while their device still appears to permit editing, but the file owner's authorization revocation takes effect before the pending edit synchronizes.
- Policy: The server must reject the unauthorized modification. On learning that access has been revoked, discard the affected unsynced local edits rather than retaining them for later replay or automatically turning them into a private copy. Do not modify the restricted source file.
- On regained access: Under S0-014, the student can edit again after access is legitimately restored, but the previously discarded offline edits are **not** automatically reinstated.
- Precedence: This is an explicit permission-revocation exception to the general preservation of unsynced changes in S0-009, S0-011 and S0-014. It does not overturn S0-008 for separately eligible notes permanently deleted by their owner.
- Presentation: Treat the rejection as an authorization outcome rather than a transient sync failure. Do not retry the rejected write automatically while access is absent. Routine synchronization remains background-only under S0-SYNC-UI-001. Any legally or technically necessary alert about inaccessible content is an independent decision.
- Status: Approved for product specification; implementation not yet verified.

## Next pending scenario

S0-016: If a student's device is lost or stolen, should they be able to remotely revoke that device's session and locally stored access to their CA Progress data?


