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

## Next pending scenario

S0-009: What should happen to unsynced local edits when the student tries to sign out, clear app data, or uninstall the APK before those changes reach the server?


