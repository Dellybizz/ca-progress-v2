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
- Original selection: **B — Move folder and all contents to Trash for 30 days** (**historical; the nonempty-folder behavior is superseded by S0-CONFLICT-010**).
- Trigger: A student tries to delete a student-created folder, empty or containing notes, PDFs or other files, possibly nested in subfolders.
- Latest policy (S0-CONFLICT-010): **Do not delete a folder while it contains files or other content. All contained items must first be moved elsewhere by the student.** Offer a Move Contents flow with a destination outside the deleted folder's subtree. Only after successful moves may the now-empty folder be moved into 30-day Trash. Never implicitly trash/delete its former contents. Chapter attachments and individual file IDs/history survive moves (S0-035).
- Scope guardrail: Official ICAI syllabus records and independent academic progress must not be deleted through a student-created folder deletion.
- Remaining details: How to guide relocation of nested subfolders, validate independent links/references and safe destinations, confirm moves locally/server-side before final deletion, and handle offline retries (S0-013). If content cannot be moved safely, **folder deletion must not complete**. Empty-folder Trash follows S0-001/S0-003/S0-004.
- Status: **Earlier nonempty-folder cascading-Trash rule superseded by S0-CONFLICT-010**. Latest folder policy approved; implementation not yet verified.

## S0-003 — Automatic Trash expiration after 30 days

- Decision date: 2026-10-13
- Product owner selection: **A — Automatic deletion without warning**
- Trigger: An eligible item remains in Trash when its 30-day recovery window ends.
- Policy: Permanently delete the expired item automatically after 30 days, without an additional reminder, warning, or confirmation request.
- Relationship to earlier decisions: S0-001 and S0-002 provide the 30-day Trash window and recovery for eligible data, including deleted student-created folders and their contents. This decision defines the end-of-window behavior.
- Remaining questions: Expiration timestamp/timezone and processing cadence; behavior for legal retention or disaster-recovery backups; nested-item expiration and restoration edge cases. Under S0-008/S0-CONFLICT-006, a genuine offline edit to an ordinarily purged note becomes a new recovered note, **not** a restoration of the erased original; specifically prohibited content cannot be recreated.
- Status: Approved for product specification; implementation not yet verified.

## S0-004 — Student-initiated permanent deletion before Trash expiry

- Decision date: 2026-10-13
- Product owner selection: **B — Allow permanent deletion with confirmation**
- Trigger: A student wants to permanently remove eligible items from Trash before the normal 30-day expiry.
- Policy: Provide **Delete Permanently** for individual eligible items and **Empty Trash** for all eligible Trash items. Both actions require a clear confirmation popup informing the student that the content cannot be restored through Trash.
- Relationship to earlier decisions: S0-001 and S0-002 still move eligible deleted data to Trash by default; S0-003 still removes expired items automatically after 30 days without a further warning.
- Guardrails / pending details: Permanent deletion is limited to items the authenticated student is authorized to erase. Official ICAI academic source records or independently protected records are not made deletable by this decision. **Ordinary Delete Permanently does not suppress recovery of genuine edits independently made on an offline device; S0-008 and S0-CONFLICT-006 allow those edits to become a new note while leaving the original erased.** A specific authorized legal/security removal barring re-creation is a different action. Offline execution, server-confirmation, duplicate requests, cascading deletion, backups/legal retention, and failure messaging must be defined during implementation; do not falsely display successful permanent deletion before it is committed.
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
- Important distinction: **Latest edit time**, not **first sync arrival time**, determines the winner **when edit ordering is reliable**. S0-007 provides the clock-correction safeguard. When edit order cannot be proven, S0-CONFLICT-005 preserves both versions for later user inspection/restore in private history; never pick a winner by server arrival time.
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
- Remaining technical detail: Reliable conflict detection, ordering metadata and history lifecycle. **User experience is settled by S0-CONFLICT-005:** preserve both uncertain versions, expose them only through private file history for later comparison/restore, and show no automatic sync/conflict popup.
- Status: Approved for product specification; implementation not yet verified.

## S0-008 — Offline edit after permanent deletion

- Decision date: 2026-10-13
- Product owner selection: **C — Automatically create a new note**
- Trigger: The student permanently deletes a note on one device while another device retains an offline copy, edits it while offline, then reconnects to synchronize.
- Policy: For an **ordinary student-initiated permanent deletion** (including Delete Permanently or Trash expiration), the original remains deleted and genuine later-offline edits are recovered automatically as a **separate newly created note**. This must **not** recreate content when a specifically authorized, enforceable security or legal removal prohibits its reintroduction (S0-CONFLICT-006). Do not revive the original item.
- Presentation: Make the new recovered note identifiable to the student without requiring a blocking approval step. Its new identity must not reuse the erased original ID.
- Precedence: Unlike S0-005 (editing an item still in Trash restores the original), this applies when ordinary permanent deletion occurred under S0-003/S0-004. A verified, scoped security/legal prohibition on recovery takes precedence (S0-CONFLICT-006), without changing ordinary student deletion rights.
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
- Reconciliation with S0-030: **Manual-only cleanup is now explicitly approved.** Do not automatically reclaim space by deleting temporary study-material caches, even when local storage is full; preserve the error-first/no-false-save behavior. Separate authorization-driven purge of revoked shared-original cache (S0-027) and scheduled expiration of Trash (S0-003) still apply for their distinct reasons.
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
- Precedence: Overrides previous suggestions in S0-011 and S0-012 to display routine sync status or counts. **S0-CONFLICT-005 preserves uncertain competing edits without an unsolicited conflict dialog, and lets students compare/restore them from private history on demand.** It does not revoke **S0-009** (explicit warning before signing out or app-controlled clearing when unsynced work is at risk) or **S0-010** (visible error when a change cannot be saved locally); these are data-protection exceptions, not routine sync notifications.
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
- Policy: When a student lacks access to a shared original, the app must refuse unauthorized access or operations on that **shared original**. This restriction does **not** remove independent edit rights to a private copy already lawfully saved: its owner can continue editing it (S0-CONFLICT-001). Published originals are immutable for all users regardless of access (S0-FILE-IMMUTABLE-001).
- Offline security: An offline device may not learn immediately of shared-original access revocation. On reconnection, deny operations targeting that revoked original, but **preserve and synchronize pending edits targeting an independently owned private copy** (S0-CONFLICT-001). Never classify a private-file edit as an unauthorized source edit solely because access to its originating published original was revoked.
- Deleted records: A file that no longer exists is a different situation from lack of access. S0-008 covers a permanently deleted *note* with an edited offline copy; other missing-file cases require separate rules.
- Presentation: Routine background synchronization remains silent per S0-SYNC-UI-001. The user must not be misled into thinking a denied write changed the server file.
- Status: Approved for product specification; implementation not yet verified.

## S0-015 — Discard offline edits rejected after access revocation

- Decision date: 2026-10-13
- Product owner selection: **A — Discard the edits**
- Trigger: A queued offline action attempts to alter or otherwise perform an unauthorized operation on a **shared source / access-dependent resource**, and the necessary authorization is missing when the server processes it. Published originals remain immutable regardless of authorization (S0-FILE-IMMUTABLE-001).
- Policy: Reject and do not replay unauthorized writes **targeting the revoked shared resource**. Under the original S0-015 selection, discard the unauthorized queued source-targeting edit rather than turning it into a new private copy. **Never discard, deny, or roll back edits to an independently owned private version just because original-source access was revoked** (S0-CONFLICT-001). Shared originals are never editable after publication.
- On regained access: The student can access the shared source again when permission is restored, but a previously discarded invalid source-targeting edit is **not** automatically reinstated. Independently owned private edits are preserved throughout and need no renewed source access.
- Precedence: S0-015's discard rule applies **only to unauthorized source/access-dependent operations**, not private owned-file writes. S0-CONFLICT-001 and S0-019 explicitly preserve independent private edits and unsynced private edits; S0-009/S0-011 remain applicable to such legitimate private work. S0-008 separately governs notes edited offline after permanent deletion.
- Presentation: Treat the rejection as an authorization outcome rather than a transient sync failure. Do not retry the rejected write automatically while access is absent. Routine synchronization remains background-only under S0-SYNC-UI-001. Any legally or technically necessary alert about inaccessible content is an independent decision.
- Status: Approved for product specification; implementation not yet verified.

## S0-016 — Lost or stolen device protection

- Decision date: 2026-10-13
- Product owner selection: **D — Complete device protection**
- Trigger: A student's device with an authenticated CA Progress session and potentially stored offline content is lost or stolen.
- Policy: Let the student view authenticated devices/sessions, **revoke individual selected sessions**, and optionally **Sign Out Everywhere**. Let the student request a **remote wipe of CA Progress account data on a selected device**. Immediately deny further server access for revoked sessions; the app must honor pending remote wipe instructions upon reconnecting and verifying the command.
- Security safeguards: Verify the student's identity before sensitive remote actions; protect local files and session secrets using suitable device encryption and key management. A remote wipe is a request for app-controlled account data, not an OS-wide erase of the phone/laptop. Account and device identifiers must be authenticated so one student cannot wipe another student's data.
- Hard limit: **Remote wipe cannot be guaranteed before the missing device reconnects**, and a device that stays offline may retain its already-downloaded data. Security must not imply instantaneous or guaranteed deletion of offline copies.
- Scope/details remaining: Selection and display of device sessions, all-device revocation semantics, native/web data-wipe capabilities, secure offline key storage, how prior unsynced work on a wiped device is handled, and authorization/audit logging.
- Status: Approved for product specification; implementation not yet verified.

## Saved-file configuration — approved multilayer foundation

- Request date: 2026-10-13
- Product owner direction: **Use a multi-layered ownership, access, personal-version and restore model for saved/shared files.**
- Scope: The foundation is approved in S0-017. Specific configuration controls, defaults, and follow-up update/revocation behavior require further decisions.

## S0-017 — Multi-layer file ownership, sharing and personal versions

- Decision date: 2026-10-13
- Product owner selection: **C — Both students and administrators, with the previously specified multi-layer ownership and permission system**. This explicitly confirms option C without replacing the previously approved source/personal-version isolation rules.
- Configuration authority: Students can edit and restore **their own private versions** when permitted. Administrators manage platform defaults, access rules, and publication of admin-owned originals; community publishers manage original-file sharing and access. **Once published online, the shared original's content is uneditable by anyone, including the owner and administrators** (S0-FILE-IMMUTABLE-001).
- **Layer 1 — Published original:** Each shared file has an owner/publisher and a **frozen published content snapshot**. Once shared online, **nobody may edit the published content**, including its publisher or administrators. The publisher controls distribution and access, not the published bytes (S0-FILE-IMMUTABLE-001).
- **Layer 2 — Access permissions:** Only people with currently granted access can view and work from the shared file. Enforce visibility and authorization on the server and on all modifying endpoints. Possessing a link or a previously cached copy is not permission to modify a protected original.
- **Layer 3 — Personal saved version:** A recipient may create/use an independently owned per-user copy **only when private saving is authorized**. The copy carries the original sharing-time edit capability: **View Only stays read-only even after saving** (S0-CONFLICT-008), while Edit Personal Version enables editing of that private copy where permitted. Disabling private saving prohibits the private copy itself (S0-CONFLICT-002). The saved copy's valid edit/export restrictions persist after ordinary source withdrawal; neither an original nor other students' copies may be edited.
- **Layer 4 — Restore:** Let students restore their **own private personal versions** from private revision history, and, where allowed, reset a private copy using an accessible published snapshot. Nobody (including owner/admin) may edit, overwrite, or roll back the content of a **published** original; access-removal is a separate action.
- Admin share example: Admin publishes Study Material.pdf, and that public/shared snapshot becomes permanently read-only for **everyone, including admins**. Authorized students may edit independent private copies.
- Community share example: Member A shares Notes.pdf to a group, and that shared snapshot becomes read-only for A, B, C and administrators. Where allowed, B and C edit separate private copies.
- Interaction with earlier policies: S0-014/S0-015 reject unauthorized source operations. S0-019/S0-CONFLICT-001 preserve **lawfully editable** personal copies and their queued edits after source withdrawal; they do not convert View Only saved copies into editable copies (S0-CONFLICT-008). No shared-source overwrite is allowed, and non-downloadable derived copies retain no-export restrictions (S0-CONFLICT-009).
- Engineering safeguards: Associate personal versions with source ID and source revision; distinguish source-level vs per-user permissions in both API and database; never treat a personal restore as a source write; record history; enforce isolation on every read/write/restore operation, including offline replay.
- Open questions: Available tools for editing private copies, and how a publisher corrects a published error by a separate publication or notice. A published original cannot receive source-content updates under S0-FILE-IMMUTABLE-001.
- Status: Approved for product specification; implementation not yet verified.

## S0-018 — Independently saved personal versions are not overwritten

- Decision date: 2026-10-13
- Original selection: **B — Keep the student's version**.
- Continuing approved outcome: A student-owned **private version** keeps its content, edits and history without being changed by the original publisher's actions.
- Superseded premise: Earlier wording assumed a publisher/admin could revise an existing online published original. Under S0-FILE-IMMUTABLE-001 the published content **cannot be edited**. Accordingly there is no in-place source-update event that could replace a student's copy.
- If the owner separately publishes an entirely new resource, that is a different file/snapshot and must not silently overwrite prior public or private copies. A correction/new-publication policy remains to be decided.
- Status: Private-copy protection approved; original-update scenario superseded; implementation not yet verified.

## S0-SHARE-001 — Edit permission is configured at the moment of sharing

- Decision date: 2026-10-13
- Current product owner direction: **Edit access can only be configured while sharing a file.**
- Supersession: This replaces the earlier S0-SHARE-001 proposal to provide ongoing post-sharing edit-permission changes or revocation. That earlier statement is **superseded**, not an active approved rule.
- Sharing flow: When the owner shares a file, the sharing interface must let the owner select whether recipients receive permission to **edit their own personal versions** or have **view-only** access. That choice is made during the share action. **For selective private shares, Edit Personal Version requires Allow Save to Private Files**: if private saving is disabled, no personal version can be created, so editing is unavailable (S0-CONFLICT-002).
- After sharing: Do not change an existing share's View Only vs Edit Personal Version setting. **Separate owner-controlled access restrictions** for selected recipients or share instances are allowed after sharing under S0-SHARE-002. Restricting access does not edit the share's original permission setting.
- Ownership: **No one**, including the publisher or administrators, may edit the published original content once shared online (S0-FILE-IMMUTABLE-001). A recipient with Edit Personal Version may edit only an authorized private version; if the share was **View Only**, any copy lawfully saved through that share stays **read-only**, including after original-source revocation (S0-CONFLICT-008). No recipient can modify another person's copy.
- Security: The backend enforces the permission selected at sharing. An unauthorized recipient cannot bypass view-only by using an API, cached copy, or offline replay.
- Open items: Exact UI/workflow for unsharing the original, and recipient-by-recipient withdrawal. Under S0-019, already-created personal versions survive ordinary withdrawal or deletion of the original.
- Status: Approved product policy; implementation not yet verified.

## S0-019 — Personal copies survive withdrawal of original sharing

- Decision date: 2026-10-13
- Product owner selection: **B — Keep personal versions**
- Trigger: The publisher stops sharing the original source file or deletes the original after a permitted recipient has already created a personal version.
- Policy: The recipient loses access to the original shared file but **retains their already authorized private version**, with its content, authorized personal notes and applicable revision history. Preserve **the edit rights that were actually granted when the copy was created**: an editable copy remains editable; a saved **View Only** copy stays read-only and does not gain editing or content-restore rights (S0-CONFLICT-008). Do not erase or overwrite lawful copies due solely to source withdrawal.
- Separation: A personal version is independently owned by its recipient once lawfully created. Revoking the ancestor's original does not revoke the person's ownership or an independently authorized onward share of their version (S0-CONFLICT-004). Do not re-grant access to the withdrawn original; any original-reference access/download still requires currently valid permission. Published originals are immutable.
- Interaction with S0-014/S0-015/S0-CONFLICT-001/S0-CONFLICT-008: Revocation removes original access and disallows new source-derived copies. It does not erase a lawfully created independent copy or discard **edits the copy was authorized to make**. View Only copies cannot acquire new edit rights simply through ownership; unauthorized writes targeting the source still follow S0-015.
- Exceptions requiring separate design: Administrator-imposed legal/compliance removal, unlawful content, and emergency security takedown; ordinary share withdrawal alone is not grounds for deleting a student's independent personal copy.
- Status: Approved for product specification; implementation not yet verified.

## S0-020 — Re-sharing a personal version requires original publisher permission

- Decision date: 2026-10-13
- Product owner selection: **C — Require original owner's permission**
- Trigger: A student has an independent edited personal version derived from another person's shared original and wants to share that personal version with additional people.
- Policy: The recipient may re-share their edited personal version **only when the original publisher explicitly allowed redistribution at the time of the original share**. Without that permission, the personal version remains independently editable and restorable by its owner under S0-017 and S0-019, but cannot be redistributed to another person.
- Sharing configuration: The original publisher's share flow must contain a distinct **Allow recipients to re-share personal versions** permission (separate from **View Only / Edit Personal Version**). Apply the permissions recorded at share time, consistent with S0-SHARE-001.
- Downstream access: If permitted, a re-shared personal version becomes a separate publisher-controlled shared source for recipients; their personal edits must not modify the re-sharer's version or the original ancestor source.
- Security: Enforce re-sharing authorization server-side, including downstream/share-link endpoints and offline queued shares. Possessing a personal copy alone does not authorize re-sharing.
- Permission across multiple re-sharing levels is defined by S0-022 (a fresh permission grant at every sharing hop). Ordinary upstream withdrawal does not cancel previously authorized downstream sharing under S0-021.
- Status: Approved for product specification; implementation not yet verified.

## S0-021 — Downstream shares survive original owner's withdrawal

- Decision date: 2026-10-13
- Product owner selection: **A — Keep downstream sharing active**
- Trigger: Student A originally shares a file with Student B and explicitly permits redistribution; B shares an independently edited personal version with Student C; A later stops sharing the original file.
- Policy: **B's already-authorized, independently edited personal-version sharing remains active** after A ordinarily withdraws the original share. C retains access to B's independent shared version under the permissions granted by B. B may continue sharing B's own version with new eligible recipients under the original redistribution permission. **This does not protect a direct reference/re-share of A's original against A's owner-level access restrictions** (see S0-SHARE-002).
- Ownership and isolation: This does not restore B's or C's access to A's withdrawn original. **A cannot disable C's independent access to B's lawfully re-shared personal-version publication merely by withdrawing A's original.** B controls distribution of their independently published version; C can create or edit their own private copy only where B granted permission. No one may edit an immutable published original (S0-FILE-IMMUTABLE-001; S0-CONFLICT-004).
- Relationship to S0-019 / S0-020 / S0-022 / S0-SHARE-002: Independently owned personal copies survive ordinary withdrawal of an upstream share (S0-019). Re-sharing personal versions requires per-hop permission (S0-020/S0-022). Direct re-shares of an original remain source-linked and are subject to the original owner's targeted access restrictions (S0-SHARE-002).
- Exception handling to define: Legal/compliance takedown and security incidents may need a separate, explicitly authorized override; do not infer that normal withdrawal automatically erases downstream copies.
- Status: Approved for product specification; implementation not yet verified.

## S0-022 — Re-sharing permission is granted at every sharing level

- Decision date: 2026-10-13
- Product owner selection: **B — Permission at every sharing level**
- Trigger: Student A permits Student B to re-share A's file; B shares B's own version with C; C wants to re-share C's own version with D.
- Policy: **Each direct publisher must explicitly authorize the next recipient to re-share at the time of sharing.** A must permit B to re-share, B must independently permit C to re-share, and C must independently permit D to re-share before D can re-share onward. Authorization from a distant ancestor does not automatically grant a downstream recipient re-sharing rights.
- Permission inheritance: No downstream publisher can grant re-sharing rights if they themselves did not receive permission to re-share. Each hop must satisfy its direct source-sharing grant. This is a chain of granted permissions, not an unrestricted global redistribution flag.
- Ownership: Every new shared version remains separate from prior publishers' originals. Recipients can edit only their own permitted personal versions. The direct publisher chooses view/edit-personal-version and re-sharing permissions during sharing (S0-SHARE-001 and S0-017).
- Interaction with S0-021 and S0-SHARE-002: Previously authorized independently re-shared **personal versions** survive ordinary upstream withdrawal, subject to applicable restrictions and safety exceptions. Direct re-shares that point to the **original** remain governed by the original owner's current access restrictions. S0-022's per-hop permission rule governs re-sharing of personal versions, while S0-SHARE-002 defines an owner-authorized unlimited **original-reference** re-sharing mode.
- Security: Server must validate publisher identity, the lineage of allowed re-sharing, per-hop grants and share creation; prevent a recipient without re-sharing authority from using direct links, API requests or offline replay to redistribute.
- Follow-ups: Whether view-only access permits downloading an independent noneditable copy; handling of unlawful content/compliance takedowns; handling access withdrawal at intermediate levels.
- Status: Approved for product specification; implementation not yet verified.

## S0-SHARE-002 — Direct re-sharing of originals, unlimited re-shares, and selective access controls

- Decision date: 2026-10-13
- Product owner clarification: **A recipient does not have to make or share a personal version; an original file may itself be re-shared. An owner can allow unlimited re-shares of that original, while restricting access for selected people or selected shares.**
- Two distinct sharing paths:
  1. **Direct original-reference re-share:** A recipient shares access to the publisher's original file **without creating a new editable original or duplicating the content**. Subsequent viewers see the **immutable published original** (subject to permissions); **no one**, including the publisher and administrators, can edit that snapshot. The publisher may still control access and sharing.
  2. **Independent personal-version re-share:** A recipient shares their own separate edited version where authorized. Rules S0-017 through S0-022 continue to govern its ownership, independence, and per-hop re-sharing authorization.
- Unlimited original re-sharing: During the original sharing configuration, its publisher can permit **unlimited onward re-sharing of the original reference**. When enabled, no new direct publisher approval is required for each onward re-share of that original, **provided each recipient is otherwise eligible and the original owner's active restrictions allow access**. This is an explicit mode distinct from S0-022's per-hop permission grants for independent personal-version sharing.
- Owner's targeted restrictions: The original owner may subsequently **block particular people** from access to the original and/or **disable particular share instances/links or branches**. Such restrictions take precedence over unlimited re-sharing. A blocked person must not regain source access through another path/link, and a disabled share link must not continue to authorize source access. Whether disabling a parent share should automatically disable its descendants is not yet decided.
- Config-time vs post-share: The View Only versus Edit Personal Version capability is selected **at sharing time** under S0-SHARE-001; the owner may nevertheless later restrict **access itself** for selected recipients or shares. This is not a post-sharing change to the existing edit permission.
- Personal-version retention: Ordinary revocation of original-source access does not erase already-created independently owned personal copies or terminate previously authorized shares of independently published personal versions (S0-019/S0-021/S0-CONFLICT-004). The original owner cannot use original-file branch controls to disable these separate downstream publications. A direct reference to the original must still satisfy current original-owner access restrictions.
- Enforcement: Use source-ID references, provenance/share lineage and server-side checks on every access or redistribution. Never grant source-edit rights to downstream viewers. Cache/offline access, branch-level revocation propagation, and time to enforce downloaded-copy restrictions need explicit technical designs.
- Remaining decisions: Default re-sharing mode; whether publisher can change unlimited-re-sharing permission after initial sharing; visibility and audit of who received the file. S0-024 establishes owner-selected revocation of specific recipients/branches; S0-025 will establish the effect of multiple independent access paths.
- Status: Approved product-policy clarification; implementation not yet verified.

## S0-023 — Download permission depends on shareability and publisher choice

- Decision date: 2026-10-13
- Product owner selection: **Custom — no download for non-shareable files; publisher controls download for shareable files**
- Trigger: A recipient accesses a file published or shared within CA Progress and requests to download/export the file.
- Policy:
  - **Non-shareable file:** Do not allow recipients to download/export it.
  - **Shareable file:** During the file-sharing configuration, the owner/publisher is offered an independent **Allow Download** toggle; recipient download/export is permitted only if the publisher enabled it.
  - This is separate from **View Only vs Edit Personal Version** and from **Allow Re-sharing**. Having view access alone does not grant download rights. Having permission to re-share does not automatically grant download permission unless explicitly chosen by the owner.
- Enforcement: **No-export must follow restricted content into offline caches and permitted in-app private copies/derived versions** (S0-CONFLICT-009), and downstream re-shares cannot promote a restricted file to downloadable. Block raw/plaintext file downloads through application controls, backend file endpoints, object storage or signed URLs; enforce permissions server-side. Provide ciphertext-only protected offline packages for allowed viewing through CA Progress, with device-account-bound protected keys where feasible. A hidden Download button or encryption-at-rest alone is insufficient. It remains impossible to guarantee prevention of extraction by a modified authorized client or external capture.
- Limitations: Once an authorized recipient obtains an exported copy, the platform cannot reliably recall it. Browser caching, screenshots and screen recording also mean view-only is not absolute protection against copying.
- Terminology: "Non-shareable" still prohibits onward sharing and recipient download as originally chosen; a **separately shareable file with Allow Download = off** is likewise no-export. Both classes need the protected viewing model in S0-CONFLICT-009. In-app Save to Private Files does not imply an authorized export or a raw file-delivery endpoint.
- Status: Approved for product specification; implementation not yet verified.

## S0-024 — Selective revocation of recipients and sharing branches

- Decision date: 2026-10-13
- Product owner selection: **C — Owner selects affected recipients**
- Trigger: The original publisher/owner wants to revoke access to one or more recipients or downstream branches in a sharing tree (for example, A shared the original with B, B onward to C, C onward to D).
- Policy: Provide the original owner with a **sharing-chain viewer** showing people and share branches; allow the owner to **select exactly which recipients and/or downstream branches to disable**. Do **not** automatically revoke an entire branch merely because the owner targets one recipient, and do not disable unrelated branches. Only the selected recipient(s) and selected branch(es) lose the access that the corresponding restriction controls.
- Owner authority: Enforce targeted person-level blocks and share-link/branch restrictions server-side; recipients cannot bypass an explicit person-level block by using an alternative link. If an entire selected share branch is disabled, access paths under that branch must be invalidated as applicable. Retaining access for untargeted downstream recipients requires valid individual grants or independent share paths rather than treating a revoked ancestor's link as authorization.
- Existing personal versions: Revocation controls in this section affect the original owner's **own original-reference share tree**, not independently owned downstream private copies or independently published shares of those copies. Previously authorized personal-version sharing survives ordinary ancestor-source withdrawal under S0-019/S0-021/S0-CONFLICT-004. Direct re-shares of the original remain subject to its owner's restrictions.
- Remaining implementation details: How to model share lineage and independent access paths; selecting users versus links; previewing the effect of revocation before confirmation; offline access/revocation limitations; event audit logs.
- Status: Approved for product specification; implementation not yet verified.

## S0-025 — Independent valid sharing paths preserve access

- Decision date: 2026-10-13
- Product owner selection: **A — Keep access through valid routes**
- Trigger: The same recipient has original-file access through multiple independently authorized sharing paths (e.g. A shares with B and C, both share with D), and the original owner disables only one path (e.g. B's branch).
- Policy: **Revoke only the explicitly disabled path.** If the recipient still has another valid, independently authorized sharing route (e.g. via C), they **retain access to the same original** through that surviving route without needing a new share. A blocked branch must not be used as authorization.
- Global person-block precedence: If the original owner explicitly blocks recipient D (not merely one share path), D loses access to the owner's original through **all** routes, consistent with S0-024 and S0-SHARE-002.
- Version protection: Do not alter independently owned personal versions protected by S0-019 merely because an original-reference share path was disabled.
- Security and engineering: Evaluate effective access as the union of valid grants minus explicit user-level blocks and source restrictions; invalidate only revoked path grants and cache decisions appropriately. Prevent alternate link IDs from bypassing person-level blocks. Preserve auditable share provenance; carry policy through offline reconnection.
- Status: Approved product specification; implementation not yet verified.

## S0-026 — Revocation affects shared originals, not independently saved files

- Decision date: 2026-10-13
- Product owner selection: **Custom clarification — distinguish public shared access from independently saved/tagged copies, and apply extra restrictions to private selective shares.**
- **Publicly shared file:** If a student legitimately uses **Save to Private Files** or **Add/Tag to Chapter** on a publicly available shared file, that action must result in a durable, student-owned private file/version, not merely an access-dependent link to the public original. Revoking or restricting access to the publicly shared source removes access **only to that public shared original**, not to private copies previously saved or attached to the student's chapter. The student keeps their own permitted edits and personal restore rights under S0-019.
- **Public file not saved/tagged:** Merely viewing a public original or transiently caching it is NOT equivalent to deliberately adding it to Private Files or a chapter. Temporary caches must be purged after confirmed revocation, as decided in S0-027.
- **Privately shared file with selected people:** At the time of sharing, the sender/owner must be able to independently control whether recipients can **Save to Private Files** and whether they can **Add/Tag to Chapter**. If the sender disallows an action, that action must not create an independent recipient-owned copy or chapter attachment. Permitted viewing does not imply permission to retain privately or attach to a chapter.
- **Permission consistency:** A privately shared file with **Allow Save to Private Files = off** cannot be copied to a privately owned personal version, cannot have **Edit Personal Version** enabled, and cannot be attached to a chapter in a way that creates a durable private copy. If the owner enables Edit Personal Version, the sharing UI must also enable private saving; if they disable private saving, automatically disable editing and durable chapter tagging (S0-CONFLICT-002). Owners may allow saving while separately prohibiting chapter tagging. Ordinary protected offline caching remains allowed under S0-028 and does not confer private ownership.
- **Previously authorized copies:** A durable personal copy properly created when saving/tagging was allowed remains independent if the original share is withdrawn. Its owner's pending and future private-file edits remain valid and sync normally despite upstream revocation (S0-CONFLICT-001). Legal/compliance takedowns and exceptional security removals still require a separate explicit policy.
- **Other permissions:** Distinguish in-app **Save to Private Files** / **Tag to Chapter** from external **Download/Export**. A lawfully saved **View Only** private copy stays read-only (S0-CONFLICT-008). A non-downloadable original's restriction **continues into its in-app copies and derived versions**; neither owning nor editing a private version authorizes exporting protected content (S0-023/S0-CONFLICT-009). Re-sharing remains governed by S0-020/S0-022 and sharing-time controls.
- **Enforcement:** Store a stable private file identity/ownership record and copied content as required to ensure true independence, with provenance back to the originating public/private share. Apply sharing-type and per-share permissions server-side (including on API calls and queued offline actions). When share access is revoked, stop access to the original while preserving explicitly authorized durable personal copies.
- **Unresolved:** Whether restricted privately shared files permit temporary offline caches before revocation (S0-028); exact file-copy and storage-accounting lifecycle; UI for public saves and selective-private sharing.
- Status: Approved for product specification; implementation not yet verified.

## S0-027 — Purge temporary shared-original cache on revocation

- Decision date: 2026-10-13
- Product owner selection: **A — Automatically remove cached original on reconnect**
- Trigger: A recipient viewed a shared original, which CA Progress temporarily cached without explicitly saving it to Private Files or attaching it to a chapter; the owner revokes that recipient's access while the device is offline.
- Policy: When the device reconnects and the server confirms access revocation, **automatically delete the local temporary cache of the shared original** and prevent further access to that original through the revoked permission. No student intervention is required.
- Protection: Do not remove independent student-owned personal versions or chapter-linked private copies previously created with permission under S0-019 and S0-026. A temporary preview/cache is not a durable private copy.
- Multi-path access: If another independently valid sharing route still grants access (S0-025), do not treat the recipient as fully revoked; assess effective permissions and decide cache handling on those permissions.
- Security: Enforce server authorization before serving the source. Clean up cache keys, derivative previews, offline indexes and associated data as applicable; do not confuse ordinary cache purge with remote erasure of files exported outside the app.
- Limitation: An entirely offline device cannot learn about the revocation immediately; automatic cache deletion only happens after it reconnects and verifies the changed access.
- Presentation: Execute authorization reconciliation and cache cleanup silently in the background under S0-SYNC-UI-001.
- Status: Approved for product specification; implementation not yet verified.

## S0-028 — Automatic protected offline viewing of restricted private shares

- Decision date: 2026-10-13
- Product owner final selection: **A — Always allow offline viewing** (the later A selection supersedes an earlier B selection in the conversation).
- Trigger: A recipient is permitted to view a privately shared file, but the sender has disabled downloading, private saving and chapter tagging. The recipient opens the file online and later reads it offline.
- Policy: CA Progress **automatically maintains a protected temporary in-app cache for offline reading of authorized files**, even when the sender prohibits normal downloads, permanent private saving and chapter tagging. The recipient does not need a separate offline-viewing toggle from the sender. This temporary cache is not a student-owned independent file.
- Enforcement: The cache must not enable an ordinary download/export, creation of a private permanent copy, unauthorized chapter attachment, or modifications of the original. Share permissions and server-side access checks remain effective whenever the device is online.
- Revocation: When reconnection confirms that the recipient no longer has any valid access route, the app silently deletes the temporary original-file cache according to S0-027. An entirely disconnected device may continue to have its previously cached content until it reconnects, which cannot be instantaneously revoked.
- Security: For non-downloadable content, use encrypted in-app offline file packages with protected, account/device-bound key access where technically feasible and authenticated viewer authorization (S0-CONFLICT-009). The backend must not expose raw downloadable plaintext through direct file/object-storage URLs. These controls can deter ordinary export and tampering but **cannot guarantee** prevention of extraction by a compromised or modified authorized client, screenshots, recording or other external capture.
- Status: Approved for product specification; implementation not yet verified.

## S0-FILE-EDIT-001 — Superseded published-original editing rule

- Original decision date: 2026-10-13
- Previous decision allowed in-app editing of a shared original by its owner/admin but disallowed replacement PDF uploads.
- **Status: SUPERSEDED by S0-FILE-IMMUTABLE-001.** Editing a published original in-app or by a new upload is no longer permitted. Kept only as historical context.

## S0-FILE-IMMUTABLE-001 — Public/shared originals are immutable; private copies remain editable

- Decision date: 2026-10-13
- **Latest product owner decision:** Once a file is shared online, its **published online version cannot be edited by anyone, including an administrator or its owner**. A **private version can still be edited** by the person entitled to edit that private version.
- **Public/shared file:** Freeze the published content as an immutable version or snapshot at the first online share/publication. Prohibit owner/admin/recipient in-place edits, PDF replacements, annotations written back to the published source, content restoration over that source, and any offline queued write to it. Enforce server-side, not merely by hiding UI controls. Publisher controls file access, sharing branches, and other approved share settings without mutating content.
- **Private editable file/version:** The user may edit their own private version in-app as authorized; editing the private copy **never updates the published shared original**. If the private version is later shared as a separate online source, publish an immutable shared snapshot of that version; further editing of the privately owned working copy must not modify its already published snapshot.
- **New publication vs editing:** Initial creation/upload/sharing remains possible. The user has not yet specified the workflow for correcting a published error, publishing a separate corrected snapshot, or withdrawing the erroneous original. No replacement of the same public snapshot is authorized.
- **Overrides:** Supersedes S0-FILE-EDIT-001's in-app edits of the published original; removes the in-place-update premises of S0-018 and S0-029; updates original-edit references in S0-017 and S0-SHARE-001. Independent personal copies and permissions from S0-019/S0-026 remain protected.
- Technical implementation: Separate private editable records from immutable published snapshots, with stable source/version IDs and write-authorization checks for all roles. Edits to a private source should not change the content hash or bytes of any previously published snapshot.
- Status: Approved policy; implementation not yet verified.

## S0-029 — Prior automatic update of shared original is not applicable

- Original decision date: 2026-10-13
- Previous selection: **A — Refresh the offline cached original automatically after an owner's in-app source edit**.
- **Status: SUPERSEDED premise** by S0-FILE-IMMUTABLE-001: no owner/admin may edit the shared original after publication, so the cache will not receive in-place content revisions of that same snapshot.
- Unchanged general rules: Background cache and permission reconciliation stay silent (S0-SYNC-UI-001); access revocation purges temporary shared-original cache on reconnect (S0-027); personally saved private files are independent (S0-018/S0-026).
- A newly separately published file, if ever offered as a correction, must have a distinct snapshot ID and cannot silently replace this original. Future behavior for that case remains undecided.

## S0-030 — Manual-only cleanup of temporary storage caches

- Decision date: 2026-10-13
- Product owner selection: **A — Manual cleanup only**.
- Trigger: Temporary offline study-material caches consume considerable device storage or device storage becomes low/full.
- Policy: **Do not automatically clear disposable locally cached study materials to reclaim storage**, whether based on storage pressure, age, a periodic schedule, or routine optimization. Only remove these caches when the student explicitly initiates a relevant cache-clearing action. Never automatically delete private files, chapter-tagged private copies or unsynced work for storage reclamation.
- Interface: Provide an explicit **Clear Cache / Clear Temporary Cache** action. **It removes unpinned temporary caches only, not files marked Keep Available Offline.** Students must explicitly unpin/remove a file's offline copy separately (S0-CONFLICT-003). Distinguish temporary cache, pinned offline material, independently owned private materials and pending edits; clarify that cleared temporary content needs fetching again.
- **Reconciliation with S0-010:** This explicitly confirms and strengthens S0-010 (storage full during offline editing): **show a Storage Full / Unable to Save error and do not falsely claim data is saved; do not auto-delete student content or disposable caches to recover capacity**. Student-driven storage management can be offered, but automatic cleanup to make room is forbidden.
- **Specific mandatory removals unaffected:** Automatic expiration/permanent deletion of user-deleted Trash items under S0-003, and security/authorization-mandated removal of a revoked shared-original temporary cache after reconnect under S0-027, are **not storage optimization cleanup** and continue to apply. Such deletion is for user-authorized Trash lifecycle or revocation, not age/low-disk routine cache clearing. Account/session security actions also remain governed by their own rules.
- Platform limitation: Operating systems may evict app-managed cache data independently; this policy restricts CA Progress's own intentional storage-reclamation cleanup and cannot guarantee retention against OS-level eviction, user device-data clearing or uninstall.
- Status: Approved for product specification; implementation not yet verified.

## S0-031 — Students can pin individual eligible files for offline use

- Decision date: 2026-10-13
- Product owner selection: **B — Allow students to pin files offline**.
- Trigger: A student wants to deliberately keep a specific eligible shared study file or material available for offline reading, separately from ordinary temporary background caching.
- Policy: Provide a per-file **Keep Available Offline / Remove Offline Pin** control. When selected, download/store an authorized, protected in-app offline copy of that specific file and retain its pin on **that device only** while the student wants it offline. Removing the pin explicitly removes that device's pinned offline copy, subject to separate ordinary temporary-cache behavior; do not treat the action as pinning an entire chapter. Under S0-CONFLICT-007, this pin does not cause automatic pinning on other devices.
- Permissions: Pinning does **not** turn a shared file into an independently owned private version, grant re-sharing/export/download rights, or bypass restrictions on Save to Private Files or Tag to Chapter. It is protected in-app storage, under S0-028 and S0-023. Private files saved by the user remain distinct from source caches.
- Revocation precedence: If the owner revokes access and the student no longer has a valid route to the shared original, remove its offline copy after permission reconciliation on reconnect **even if pinned**, as required by S0-027; this is a security/access action, not routine Clear Cache, and takes precedence over S0-CONFLICT-003. A pin cannot override owner access restrictions.
- Storage precedence: Under S0-030 and S0-CONFLICT-003, routine cache cleanup remains **manual-only**; **Clear Cache never removes pinned offline files**. The student must explicitly remove the relevant offline pin/copy. Never auto-evict pinned material just to free space. If storage cannot accommodate the pin/download, handle the error accurately under S0-010.
- Background behavior: On the **device where the student pins a shared file**, download/retain its authorized protected offline content without disruptive routine sync dialogs, consistent with S0-SYNC-UI-001. An intentional offline-pin indicator can communicate selected retention without exposing background sync machinery. Other signed-in devices retain ordinary preview caching only, unless separately pinned there (S0-CONFLICT-007).
- Device limitations: An OS may clear app data, cached data or the entire app upon uninstall; a pin cannot guarantee availability after OS-level removal or when the file has not yet been successfully stored.
- Multi-device distinction: **Shared-file Keep Offline pins are local to the device that sets them** (S0-CONFLICT-007); private owned files, by contrast, follow automatic cross-device local-first syncing (S0-032). File size limits and implementation details of local/cloud storage remain to be specified.
- Status: Approved for product specification; implementation not yet verified.

## S0-032 — Local-first private files with automatic cloud and multi-device sync

- Decision date: 2026-10-13
- Product owner selection: **C — Local-first with automatic cloud sync**.
- Trigger: A student creates, saves, or edits an independently owned private file on one authorized device and later accesses the same account on another device, whether online or offline.
- Policy: **Save permitted private files locally first for instant offline use and automatically sync them securely to the student's account in the cloud.** Authorized devices signed in to that account should automatically receive the student's private files for local offline access as background synchronization permits and **subject to actual available device storage**. Do not require manual per-file downloads for normal cross-device availability under this selection.
- Offline and reliability: Local edits must remain usable offline and queue for eventual synchronization. Use idempotent retries and partial-operation safety (S0-011/S0-012), maintain parent/child dependency ordering (S0-013), and resolve concurrent private-file edits per approved edit-time/clock-correction rules (S0-006/S0-007); never claim a write succeeded without durable local persistence (S0-010).
- Capacity: Honor each student's actual cloud plan/quota limits and device free-space constraints without promising unlimited storage. If insufficient space exists for a new local save or transfer, provide an actionable storage error (S0-010) rather than falsely claiming offline availability, and never auto-clean private files or caches to make space (S0-030). Exact quota/error treatment is not decided in this file.
- Permissions and isolation: Sync only files independently owned or otherwise legitimately allowed as private copies. **Do not silently duplicate restricted merely-shared originals into permanent private ownership**; S0-023/S0-026/S0-028/S0-031 still govern shared-original downloads, save rights, temporary offline caching and offline pins. **A Keep Offline pin on a shared original is device-specific** and does not automatically download/pin that shared original on other devices (S0-CONFLICT-007). Maintain user-scoped access and encryption/protection across devices.
- Sync presentation: Automatic normal synchronization must run invisibly in the background under S0-SYNC-UI-001; only actionable exceptional situations (such as data loss / full storage) warrant alerts. Distinguish files queued for cloud upload from server-confirmed backups internally.
- Deletion and history: Cross-device deletions, Trash retention and restoration continue to obey S0-001 through S0-008; automatic multi-device propagation must not resurrect permanently deleted originals or erase legitimately independent private copies.
- Limitations: Independently owned private files cannot arrive on an offline secondary device until synchronization/connectivity is available; the operating system may remove local app data independently. Sync does not guarantee instantaneous delivery. A shared file deliberately pinned offline on one device is not automatically pinned on another (S0-CONFLICT-007).
- Status: Approved for product specification; implementation not yet verified.

## S0-033 — Resume interrupted private-file uploads automatically

- Decision date: 2026-10-13
- Product owner selection: **A — Resume automatically from the last verified chunk**.
- Trigger: Cloud upload of a privately saved file stops due to network interruption, app suspension or closure, device restart, or another recoverable transport failure, after some chunks were already transferred.
- Policy: **Preserve the complete locally saved original and automatically resume the interrupted upload from the latest server-verified chunk** after connectivity and background execution permit. Avoid restarting the full file transfer merely because the connection was interrupted.
- Data integrity: Use resumable upload/session identifiers, deterministic chunk offsets or part IDs, authenticated ownership, server-side checksums and final end-to-end verification. A cloud backup counts as complete only after server confirmation of the whole verified object. If the server can no longer validate an upload session/chunk, safely renegotiate and retransmit only the necessary data, falling back to a new upload when technically required.
- Background reliability: Persist pending upload state across app launches where supported, retry transient failures with bounded backoff and idempotent commit/finalization (S0-011/S0-012), and avoid duplicate or partially visible files in cloud listings.
- Student experience: Routine transfers and resumptions happen invisibly under S0-SYNC-UI-001; do not display normal loading/progress banners, manual resume prompts, or false success messages. Raise an actionable alert only where storage, permissions or unrecoverable failure means student action is necessary.
- Storage and offline guarantees: Never discard the local original just because upload is incomplete. Follow S0-010/S0-030 for local-full/storage-reclamation handling, and S0-032 for cross-device synchronization only after cloud completion.
- Implementation note: Chunk granularity, encryption format, persistence mechanism and server provider-specific upload protocol remain technical design matters, not yet verified in the deployed site or APK.
- Status: Approved for product specification; implementation not yet verified.

## S0-034 — Deduplicate identical content without merging file entries

- Decision date: 2026-10-13
- Product owner selection: **D — Smart storage deduplication (recommended)**.
- Trigger: A student uploads, copies or saves a file whose bytes are identical to a file already stored in an eligible storage scope.
- Policy: **Retain separate logical file entries and locations** with their own names, folders/chapter attachments, ownership/access metadata, and lifecycle, while **reusing one verified underlying content object** for identical bytes where safe and technically possible. Do not unexpectedly merge or remove file entries, and do not require a routine duplicate-warning prompt.
- Content identity: Only deduplicate after checking full-content identity (e.g., cryptographic digest plus verified size/content or integrity checks). Equal filenames do not imply identical content; differing bytes must remain separate content objects. Reference counting or equivalent safe reachability tracking must prevent accidental content deletion while any authorized file entry still references it.
- Independent edits: Use **copy-on-write** or immutable content objects so edits to one *private* file create a separate content revision and never modify another logical file, another student's copy or any immutable online publication (S0-FILE-IMMUTABLE-001). Independent file history/trash and personal versions remain isolated.
- Permission and privacy: Deduplication is a storage implementation detail only, never a reason to reveal another user's file existence, share a decryption key without authorization, grant access, bypass save/export permissions (S0-023/S0-026), or couple deletion/access revocation across different file entries. Cross-account deduplication is not automatically authorized; apply appropriate isolation and encryption boundary policies.
- Sync and offline: Local-first storage and multi-device cloud sync remain per S0-032; perform deduplication without interruptive sync messages under S0-SYNC-UI-001. On content corruption or inability to prove identical content, safely store separately instead of coalescing unverified objects.
- Quotas: Precise plan-quota accounting and any user-visible storage savings metrics are not decided by this choice; define these separately to avoid silently changing subscription/storage entitlements.
- Status: Approved for product specification; implementation not yet verified.

## S0-035 — Preserve private file identity when moving or renaming

- Date: 2026-10-13
- Selection: **A — Preserve original file identity**.
- Rename and move the same owned private file; do not create a new copy. When deleting an occupied folder, its contents must be successfully moved to a valid location outside that folder before the folder can be deleted (S0-CONFLICT-010).
- Preserve its file ID, revision history, annotations, and existing chapter attachments. Changing a folder is not equivalent to removing a chapter tag.
- Update file metadata locally first and synchronize the change to the user's other devices silently (S0-032), without re-uploading file contents.
- Honor private-file permissions, concurrent offline edit rules (S0-006/S0-007), smart deduplication (S0-034), and public-file immutability (S0-FILE-IMMUTABLE-001).
- Handle name conflicts or invalid destination folders safely, without dropping references.
- Status: Approved product specification; implementation not yet verified.

## S0-036 — Student-controlled private file version history

- Decision date: 2026-10-13
- Product owner selection: **D — Student-controlled history**.
- Trigger: A student edits their own private notes or files over time and wishes to inspect, restore, or manage earlier versions.
- Policy: **Preserve private-file revisions by default**, subject to applicable storage quotas, and let students **delete selected past revisions** or **set their own version-retention limit**. Do not impose a mandatory automatic 20-version or 90-day limit on everyone.
- Default behavior: Unless the student has chosen a retention limit, CA Progress must not silently purge historical private revisions for routine age-, count-, or storage-optimization reasons. Existing data must not be discarded without an authorized user retention/deletion action, except for separately authorized security, legal, or deletion lifecycle rules.
- User controls: Provide per-file history with revision identification, **side-by-side inspection/comparison of concurrent uncertain offline revisions (S0-CONFLICT-005)**, restoration of a chosen earlier revision, selected-revision deletion, and configurable retention preferences. Neither uncertain competing version is silently discarded or automatically merged; restoration affects only that student's private editable copy, never an immutable published snapshot (S0-FILE-IMMUTABLE-001), and remains subject to deletion/Trash rules.
- Quota and capacity: Retained history counts toward applicable storage consumption according to a separately defined quota-accounting rule. At quota or device capacity exhaustion, do not automatically delete revisions to make room; handle the inability to save reliably and visibly under S0-010 and S0-030, offering user-directed cleanup instead.
- Data model and deduplication: Revisions retain a stable association with their private file identity through renames and moves (S0-035). Reuse verified identical content safely using S0-034, with copy-on-write and reference-safe deletion; removing one revision must not corrupt another entry or snapshot.
- Sync and permissions: Sync private version history and retention choices among authorized devices under S0-032 while keeping routine sync invisible (S0-SYNC-UI-001). Permit changes only by the student who owns the private file, subject to access rules; offline competing updates follow established conflict policies.
- Details not decided here: Exact numeric user-selectable retention options, how to treat older revisions immediately after a student changes their limit, and history-storage accounting.
- Status: Approved for product specification; implementation not yet verified.

## S0-CONFLICT-001 — Keep owned private-file edits after shared-original revocation

- Decision date: 2026-10-13
- Product owner selection: **A — Keep all valid private edits**, conflict-resolution question 1 of 7.
- Trigger: Student A publishes a shared original; Student B lawfully creates an **independently owned private copy**, edits it offline, and A revokes B's access to A's published original before B reconnects.
- Policy: **Preserve all valid edits to B's private copy, including edits made offline after original access was revoked**, provided that private copy was legitimately granted **Edit Personal Version** permission. B can continue editing the authorized editable copy, with pending edits synchronized under S0-006/S0-007, S0-009/S0-011 and S0-032. Source revocation must never discard a legitimate private-file edit; **a View Only saved copy remains read-only** under S0-CONFLICT-008.
- Access distinction: A's revocation removes B's access to the **published original** and any unauthorized original-reference actions. It does **not** transfer ownership, freeze B's private copy, erase its revision history, or invalidate B's edits to that independently owned copy. The public original remains immutable for *everyone* under S0-FILE-IMMUTABLE-001.
- Enforcement: Classify every queued operation by **actual target object ID and ownership/permission**, not only by its provenance/source ancestor ID. Distinguish a write to a private file from a forbidden source write. Do not use the source's current access grant as a continuing precondition for editing an already authorized independent copy.
- Reconciliation: Clarifies S0-014 and **limits S0-015's discard rule to unauthorized operations against revoked/access-dependent shared resources**. Confirms S0-019 and S0-026. Do not allow this clarification to authorize creating a new private copy of content after access was already revoked.
- Exceptions: Separately authorized legal/compliance or emergency security takedowns remain an unresolved exceptional case; ordinary access revocation alone does not delete a lawful private copy or its edits.
- Status: Approved for product specification; implementation not yet verified.

## S0-CONFLICT-002 — Private saving is prerequisite for creating an editable personal version

- Decision date: 2026-10-13
- Product owner clarification: **If private saving is disabled on a selectively privately shared file, the recipient cannot create a personal version.** This resolves conflict-resolution question 2 of 7.
- Permission model: **Allow Save to Private Files = off** means no new independent personal copy/version can be created through that share. **Edit Personal Version requires private-saving permission**; a share configuration must not permit Edit Personal Version = on when private saving = off.
- Sharing UI: If the sender enables editing, automatically enable Allow Save to Private Files. If the sender disables private saving, turn off and disable Edit Personal Version and any durable chapter-tagging operation dependent on private saving. Do not silently override the sender's restriction with a private copy.
- Scope: This specific toggle policy applies to files **privately shared with selected people** (S0-026). Publicly shared material follows its separately approved public-saving rules. Permissions are chosen at sharing time (S0-SHARE-001), not adjusted on an existing share.
- Offline/cache distinction: Protected temporary in-app offline viewing under S0-028 is **not** a privately owned version and remains available subject to revocation checks; it must not provide a backdoor to private saving, editing, chapter attachments, or unauthorized export.
- Existing private copies: A private version lawfully saved beforehand under permission remains independently owned; later withdrawal of the original does not delete its content or edits (S0-019 and S0-CONFLICT-001).
- Enforcement: The backend and offline action replay must reject unauthorized private-copy creation, not merely hide UI controls. Published source content remains immutable for everybody.
- Status: Approved product-policy clarification; implementation not yet verified.

## S0-CONFLICT-003 — Routine cache clearing preserves pinned offline files

- Decision date: 2026-10-13
- Product owner selection: **A — Protect pinned files**, conflict-resolution question 3 of 7.
- Trigger: A student has ordinary temporary cached study materials plus files explicitly marked **Keep Available Offline**, and taps **Clear Cache**.
- Policy: **Clear Cache removes only unpinned temporary cached files. It must preserve every pinned offline file.** To remove a pinned offline file from device storage, the student must explicitly remove that file's offline pin/copy; general cache clearing cannot implicitly unpin it.
- File classes: This action does not delete independently owned private files, chapter-tagged private copies, private revision history, or unsynced changes.
- Exceptions and precedence: Authorized revocation of shared-original access still removes associated cached or pinned shared-original content upon reconnection (S0-027/S0-031). Mandatory Trash expiration (S0-003), device/session security cleanup (S0-016), and external operating-system data eviction are not ordinary Clear Cache actions.
- UI and storage: Clearly distinguish temporary cache and pinned offline storage in the settings view. Only promise files are available offline after they are successfully stored; do not silently clear pinned files when space is low (S0-010/S0-030).
- Reconciliation: Clarifies S0-030 and S0-031 without changing their original approved choices.
- Status: Approved product policy; implementation not yet verified.

## S0-CONFLICT-004 — Revoking an original does not revoke independent personal-version shares

- Decision date: 2026-10-13
- Product owner selection: **A — Independently shared personal versions remain accessible**, conflict-resolution question 4 of 7.
- Scenario: A shares an immutable published original with B and authorizes redistribution; B lawfully saves/edits a private version, separately publishes and shares that version with C under applicable per-hop sharing permissions. A later revokes B's access to A's original.
- Approved outcome: **B loses access to A's original, but B keeps the legitimately owned private copy and C retains their separately granted access to B's independently published version.** Normal revocation by A does not invalidate B's separate publication or its existing permissions. B's private edits and personal-file history remain intact.
- Distinction: **Direct re-share of A's original reference** remains governed by A's selective revocation and original-owner access restrictions (S0-SHARE-002/S0-024/S0-025). **Independent personal-version publication** is separately owned and governed by its direct publisher, not an original-reference link. New onward shares still require authorization established through the relevant grant chain (S0-020/S0-022).
- Editing: Neither A nor B nor C can edit either already-published immutable file; B may edit their separate private working copy, and C may edit their own independently saved private copy if permitted (S0-FILE-IMMUTABLE-001/S0-CONFLICT-002).
- Exceptional removal: A separately authorized legal, safety or compliance takedown is not defined by this ordinary-revocation decision.
- Reconciliation: Confirms and clarifies S0-019, S0-021, S0-024 and S0-SHARE-002 without overriding original-reference branch restrictions or creating new redistribution rights.
- Status: Approved for product specification; implementation not yet verified.

## S0-CONFLICT-005 — Preserve uncertain offline edits in private file history without sync popups

- Decision date: 2026-10-13
- Product owner selection: **A — Keep both, resolve from file history**, conflict-resolution question 5 of 7.
- Trigger: A student edits the same independently owned private note/file on two offline devices, and server-corrected clocks plus available ordering metadata **cannot reliably establish which edit came last**.
- Policy: **Retain both competing revisions intact and independently identifiable**; neither is silently discarded, automatically merged, or chosen as a winner based merely on upload arrival time. Permit the student to compare them and explicitly restore the desired revision from their private file history at any later time. Do not display a mandatory conflict-resolution popup or routine sync notification.
- Ordinary conflict priority: When reliable edit ordering exists, S0-006's latest-edit-wins rule still applies, with S0-007 server-assisted timestamp correction. This entry governs only genuine uncertainty where a trustworthy ordering cannot be determined.
- Privacy and history: These are revisions of the student's **private editable file**, not mutations of an immutable published original. File history preserves the competing content under S0-036, subject to explicit owner-chosen history-management actions. Internal unresolved markers may be recorded without exposing routine synchronization indicators.
- Sync mechanics: Use version IDs/provenance, distinguish current view from preserved alternatives without falsifying chronology, keep retries idempotent, and silently reconcile metadata as far as possible. A student's explicit comparison/restore inside file history is an ordinary feature interaction, not a background sync popup.
- Reconciliation: Clarifies S0-006, S0-007, S0-SYNC-UI-001 and S0-036. No revision to the user's approved general latest-edit-wins or invisible-background-sync decisions.
- Status: Approved for product specification; implementation not yet verified.

## S0-CONFLICT-006 — Offline recovery after ordinary deletion, not prohibited removal

- Decision date: 2026-10-13
- Product owner selection: **A — Recover ordinary deletions only**, conflict-resolution question 6 of 7.
- Ordinary student deletion: If a student deletes a note permanently through **Delete Permanently** (S0-004) or its 30-day Trash window expires (S0-003), and another device independently made genuine edits while offline, **preserve the offline edits as one new recovered note per unique change** under S0-008. The original note remains permanently deleted with its old ID; do not resurrect it or silently reverse the student's delete action.
- Authorized exceptional prohibition: If a specific, authenticated and appropriately authorized **security or legal removal order expressly prohibits reintroducing that content**, do **not** create a recovered note containing the prohibited content. Do not treat routine share revocation, ordinary file deletion, or an unverified administrative request as such an exceptional prohibition.
- Enforcement: Resolve the operation's deletion reason and target before replaying pending offline writes. When recovery is allowed, use a new ID, content-preserving idempotency and separate ownership; never fetch erased original data from server storage. When prohibited, enforce the narrowly scoped restriction without sending prohibited content back into active cloud storage or re-sharing it.
- Reconciliation: Clarifies S0-003, S0-004 and S0-008 without narrowing ordinary student-controlled deletion recovery, and does not alter existing private-copy protection on ordinary share withdrawal (S0-019/S0-CONFLICT-001).
- Unresolved legal/security implementation: Authorizing entities, proof/audit of removal orders, handling retained local prohibited copies on offline devices, and student notification/appeals must be specified before production; this entry does not authorize arbitrary administrative content destruction.
- Status: Approved for product specification; implementation not yet verified.

## S0-CONFLICT-007 — Keep Offline pins for shared files are device-specific

- Decision date: 2026-10-13
- Product owner selection: **A — Keep Offline is device-specific**, conflict-resolution question 7 of 7.
- Example: A student uses the same CA Progress account on a phone, tablet and laptop. They mark a shared PDF as Keep Available Offline on their phone.
- Policy: **Only the phone receives and retains the intentional Keep Offline pin for that shared PDF.** Other devices may temporarily cache it through ordinary authorized viewing, but do **not** automatically download or pin that shared original just because another device pinned it. The student can independently choose to pin it on any other permitted device.
- Separate private-file rule: **Independently owned private files continue to save locally first and automatically sync securely to the cloud and the student's other signed-in devices** for offline access under S0-032, subject to device space and connectivity. Do not confuse multi-device synchronization of private ownership with the device-local retention preference for shared-original cache content.
- Cleanup and permissions: Clear Cache preserves pinned files on each device (S0-CONFLICT-003); explicitly unpinning a file removes that device's pinned copy. Owner access revocation, once reconciled online, removes the revoked shared-original cache regardless of pinning (S0-027/S0-031); a pin never grants private ownership, export rights or a bypass of share restrictions.
- Error and UI: If device storage is insufficient to pin a file, do not pretend it is available offline or automatically delete other local files to make room (S0-010/S0-030). Keep background caching and synchronization invisible except for intentional feature controls and actionable errors (S0-SYNC-UI-001).
- Reconciliation: Clarifies S0-031 versus S0-032. All seven conflict-resolution decisions are now recorded; this does not claim the policies have been implemented or tested in the site/APK.
- Status: Approved for product specification; implementation not yet verified.

## S0-CONFLICT-008 — View Only remains read-only for authorized saved private copies

- Decision date: 2026-10-13
- Product owner decision: A file shared as **View Only stays read-only even when Save to Private Files was permitted and the recipient legitimately created an independent private copy**. Saving is not an implicit grant to edit.
- Permissions: View Only + Save Allowed = recipient may hold a durable **read-only private copy**. Edit Personal Version + Save Allowed = recipient may create and edit the authorized personal copy. Save Disabled = no personal copy may be created (S0-CONFLICT-002). Do not allow content mutations, editing-based restore, or embedded annotations that alter the read-only copy under View Only.
- Persistence: Ordinary revocation of the original does not delete an already lawfully saved copy, but the copy **retains its original edit restriction**. S0-CONFLICT-001 protects offline edits only for private copies whose editing was legitimately allowed.
- Enforcement: Store effective edit capability with the saved copy and enforce it for web/APK UI, API, offline sync and version restore; do not derive editing rights solely from a private owner ID. Published originals remain immutable for everyone.
- Reconciliation: Clarifies S0-017, S0-SHARE-001, S0-019, S0-026, S0-CONFLICT-001 and S0-CONFLICT-002. Implementation not yet verified.

## S0-CONFLICT-009 — Non-downloadable content uses protected encrypted in-app access

- Decision date: 2026-10-13
- Product owner decision: **No ordinary offline export or backend-file/direct-URL download may provide readable bytes of a file whose publisher prohibited downloading.** Instead, approved in-app saving and offline viewing should use protected encrypted versions designed to be usable only in CA Progress's authenticated viewer.
- Access classes: A published original marked no-download, its temporary/pinned encrypted offline cache, and any authorized saved private/derived versions **inherit a no-export restriction**. Creating a separate personal copy, editing it where separately authorized, renaming it, or re-sharing a derived publication does not erase the prohibition; recipients cannot select Allow Download for a protected descendant unless separately authorized by a future explicit policy. In-app saving and exporting remain distinct.
- Storage and delivery: Encrypt restricted file content at rest and in its device-local protected cache; deliver encrypted content for the protected viewer rather than publicly usable plaintext file links. Block standard downloads and unauthorized export from all app/API/backend/object-storage/signed-URL paths. Guard decrypt-key provisioning with authenticated and current share/copy permissions; use platform-protected key storage where feasible, including a policy for offline key use and post-revocation invalidation on reconnect.
- Security boundary: Browser/APK viewer necessarily handles decipherable content for display; a modified/compromised authorized client or screen-capture technique can potentially extract it. **No client-side scheme can guarantee that content cannot be copied or decrypted outside CA Progress.** The design must be strong best-effort access control, not a claim of absolute DRM.
- Compatibility: Authorized protected offline reading under S0-028/S0-031 continues. Saving to private files does not grant external download/export; S0-023 governs owner-approved download rights. Existing independent saved copies survive ordinary source revocation (S0-019), while remaining subject to their no-export classification.
- Remaining engineering design: File encryption format, key lifecycle across browsers/Android devices, offline revocation limits, encrypted thumbnail/render pipeline, media preview support, content editor handling, and secure object-delivery auditing must be specified and tested.
- Reconciliation: Clarifies S0-023, S0-026 and S0-028. Implementation not yet verified.

## S0-CONFLICT-010 — Move folder contents before allowing folder deletion

- Decision date: 2026-10-13
- Product owner decision: **A folder can be deleted only when every file/content item within it has already been moved elsewhere.** This supersedes S0-002's earlier rule of moving a nonempty folder together with contents to Trash.
- Delete flow: If a folder is not empty, block immediate deletion and offer **Move Contents** to a valid destination outside the folder/subtree. Do not delete, trash or auto-move any contents without a student-authorized relocation. Include items in nested subfolders, maintaining their file identities, versions and existing chapter attachments (S0-035). Only after the folder/subtree is empty and those moves have been safely persisted may the now-empty folder be sent to 30-day Trash.
- Offline sync: Apply relocation and folder deletion in a safe dependency order (S0-013). If a required move fails or was not durably saved, do not finish deleting the containing folder; avoid orphaning files or breaking chapter references. The student must be able to cancel.
- Scope: Student-created folders/collections; official ICAI records and independent academic progress cannot be erased through a folder operation. Ordinary 30-day Trash and permanent-delete rules still apply to eligible **empty folders**.
- Reconciliation: Supersedes the conflicting nonempty-folder portion of S0-002 and clarifies S0-035. Implementation not yet verified.

## Next pending scenario

S0-037: What should CA Progress do when a student attempts to upload or open a corrupted or unsupported file?
