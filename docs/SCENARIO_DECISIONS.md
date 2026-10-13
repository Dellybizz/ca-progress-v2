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
- Configuration authority: Students may manage editable settings and revisions of **their own personal versions**, subject to access rules. Authorized administrators manage platform-wide defaults/restrictions and admin-published originals. A community publisher controls their shared original, while recipients only configure and edit their own versions. Admin restrictions cannot be overridden by students.
- **Layer 1 — Source/original:** Each shared file has a canonical original with a clear publisher/owner and source version history. Admin-published originals are editable **only by authorized administrators**; recipients never change the admin's global version. In a community, an original shared by a community member remains controlled by its original owner/publisher; other members cannot edit that community-wide original.
- **Layer 2 — Access permissions:** Only people with currently granted access can view and work from the shared file. Enforce visibility and authorization on the server and on all modifying endpoints. Possessing a link or a previously cached copy is not permission to modify a protected original.
- **Layer 3 — Personal editable version:** A recipient with permitted access may create/use **their own per-user version** of the accessible original and edit only that personal version. They cannot edit the original file or other recipients' personal versions. Each personal copy has its own owner, identity, content and revision history; personal edits never silently propagate back to the global/admin/community original.
- **Layer 4 — Restore:** Let recipients **restore their own personal version** from its history, and (while access remains granted) reset their version from an accessible source version without altering the source. An original publisher/admin may restore an original only with their respective original-edit permissions; ordinary recipients cannot perform a global restore.
- Admin share example: Admin publishes Study Material.pdf. Students with access can read it and make personal annotated/edited versions. Only an authorized admin can modify or restore the global source.
- Community share example: Member A shares Notes.pdf to a group. Members B and C with access can each edit their own version, independently. Only Member A or another explicitly authorized source owner can change the source (ordinary recipients cannot).
- Interaction with earlier policies: S0-014 requires current access before editing; S0-015 discards queued edits **to a file whose access was revoked**. No shared-source overwrite from a recipient is allowed. The handling of pre-existing personal copies and revoked access must be separately decided, rather than assumed.
- Engineering safeguards: Associate personal versions with source ID and source revision; distinguish source-level vs per-user permissions in both API and database; never treat a personal restore as a source write; record history; enforce isolation on every read/write/restore operation, including offline replay.
- Open questions: What happens to a personal version when source access is revoked or the original is deleted; whether users can re-share personal versions; how far restore history goes and which file types support direct editing; who may change source ownership. Source updates are governed by S0-018.
- Status: Approved for product specification; implementation not yet verified.

## S0-018 — Updated original shared file leaves personal versions unchanged

- Decision date: 2026-10-13
- Product owner selection: **B — Keep the student's version**
- Trigger: An authorized administrator or community source owner makes edits to an original shared file inside CA Progress (S0-FILE-EDIT-001), creating a new in-app revision after recipients have created or edited their own personal versions.
- Policy: **Do not modify, replace, merge, or reset recipients' personal versions automatically.** Existing personal edits, highlights, annotations, revision history and their selected base version remain intact. Students with continuing permission may separately access the latest original shared version.
- Source ownership: In-app editing the shared original changes its publisher-controlled source revision only, never another person's private version. Replacement of an existing original by uploading a new PDF is prohibited under S0-FILE-EDIT-001.
- Future user actions: A student may choose to read or make a new separate version from the updated original under applicable access permissions; whether to provide explicit rebase/merge controls for existing personal copies is not authorized by this decision.
- Conflict and offline behavior: Source update notifications or synchronization must not silently overwrite a personal copy. Preserve independence in the website and offline APK; routine background sync is invisible under S0-SYNC-UI-001.
- Status: Approved for product specification; implementation not yet verified.

## S0-SHARE-001 — Edit permission is configured at the moment of sharing

- Decision date: 2026-10-13
- Current product owner direction: **Edit access can only be configured while sharing a file.**
- Supersession: This replaces the earlier S0-SHARE-001 proposal to provide ongoing post-sharing edit-permission changes or revocation. That earlier statement is **superseded**, not an active approved rule.
- Sharing flow: When the owner shares a file, the sharing interface must let the owner select whether recipients receive permission to **edit their own personal versions** or have **view-only** access. That choice is made during the share action.
- After sharing: Do not change an existing share's View Only vs Edit Personal Version setting. **Separate owner-controlled access restrictions** for selected recipients or share instances are allowed after sharing under S0-SHARE-002. Restricting access does not edit the share's original permission setting.
- Ownership: Only the source publisher/owner (or authorized administrators where applicable) may change the shared original. A recipient with edit access can modify only their own version, never the canonical shared original or anyone else's version, consistent with S0-017.
- Security: The backend enforces the permission selected at sharing. An unauthorized recipient cannot bypass view-only by using an API, cached copy, or offline replay.
- Open items: Exact UI/workflow for unsharing the original, and recipient-by-recipient withdrawal. Under S0-019, already-created personal versions survive ordinary withdrawal or deletion of the original.
- Status: Approved product policy; implementation not yet verified.

## S0-019 — Personal copies survive withdrawal of original sharing

- Decision date: 2026-10-13
- Product owner selection: **B — Keep personal versions**
- Trigger: The publisher stops sharing the original source file or deletes the original after a permitted recipient has already created a personal version.
- Policy: The recipient loses access to the original shared file, but **retains their previously created personal version** with its content, highlights, notes, personal edit rights, and personal restore/version-history rights. Do not delete, disable editing on, or overwrite the student's existing owned personal copy merely because the publisher withdrew the original.
- Separation: A personal version is independently owned by its recipient once lawfully created. Do not re-grant access to the withdrawn/deleted original or permit edits to the publisher's source file. Any future source updates or downloads require valid current permission.
- Interaction with S0-014/S0-015: Revocation denies writes to the shared source and disallows creation of new copies from inaccessible source content. It does **not** revoke ownership or personal editing of copies already lawfully created. Pending unauthorized writes targeting the revoked source still follow S0-015.
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
- Ownership and isolation: This does not restore B's or C's access to A's withdrawn original. B controls the independently re-shared version, and C edits only a separate personal version when allowed; nobody acquires edit rights to another person's canonical original.
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
  1. **Direct original-reference re-share:** A recipient shares access to the publisher's original file **without creating a new editable original or duplicating the content**. Subsequent viewers see the publisher-controlled original (subject to their permissions); they cannot modify that source. Original updates remain publisher-controlled.
  2. **Independent personal-version re-share:** A recipient shares their own separate edited version where authorized. Rules S0-017 through S0-022 continue to govern its ownership, independence, and per-hop re-sharing authorization.
- Unlimited original re-sharing: During the original sharing configuration, its publisher can permit **unlimited onward re-sharing of the original reference**. When enabled, no new direct publisher approval is required for each onward re-share of that original, **provided each recipient is otherwise eligible and the original owner's active restrictions allow access**. This is an explicit mode distinct from S0-022's per-hop permission grants for independent personal-version sharing.
- Owner's targeted restrictions: The original owner may subsequently **block particular people** from access to the original and/or **disable particular share instances/links or branches**. Such restrictions take precedence over unlimited re-sharing. A blocked person must not regain source access through another path/link, and a disabled share link must not continue to authorize source access. Whether disabling a parent share should automatically disable its descendants is not yet decided.
- Config-time vs post-share: The View Only versus Edit Personal Version capability is selected **at sharing time** under S0-SHARE-001; the owner may nevertheless later restrict **access itself** for selected recipients or shares. This is not a post-sharing change to the existing edit permission.
- Personal-version retention: Ordinary revocation of original-source access does not erase already-created independently owned personal copies (S0-019), nor does it automatically terminate independently authorized personal-version re-sharing (S0-021). A direct reference to the source, however, must always pass current owner access restrictions.
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
- Enforcement: Enforce download rights on server file delivery, direct download URLs, exports, client interfaces and APK workflows. Do not treat hiding the Download button alone as protection. Block unauthorized normal downloads and unapproved offline file exports.
- Limitations: Once an authorized recipient obtains an exported copy, the platform cannot reliably recall it. Browser caching, screenshots and screen recording also mean view-only is not absolute protection against copying.
- Terms to refine: Here, "non-shareable" means content designated by its owner or administrator as not permitted for recipient re-sharing; if more granular sharing classifications are introduced later, align download restrictions with the user's intended file classification. Offline in-app caching and preview requirements are to be decided separately.
- Status: Approved for product specification; implementation not yet verified.

## S0-024 — Selective revocation of recipients and sharing branches

- Decision date: 2026-10-13
- Product owner selection: **C — Owner selects affected recipients**
- Trigger: The original publisher/owner wants to revoke access to one or more recipients or downstream branches in a sharing tree (for example, A shared the original with B, B onward to C, C onward to D).
- Policy: Provide the original owner with a **sharing-chain viewer** showing people and share branches; allow the owner to **select exactly which recipients and/or downstream branches to disable**. Do **not** automatically revoke an entire branch merely because the owner targets one recipient, and do not disable unrelated branches. Only the selected recipient(s) and selected branch(es) lose the access that the corresponding restriction controls.
- Owner authority: Enforce targeted person-level blocks and share-link/branch restrictions server-side; recipients cannot bypass an explicit person-level block by using an alternative link. If an entire selected share branch is disabled, access paths under that branch must be invalidated as applicable. Retaining access for untargeted downstream recipients requires valid individual grants or independent share paths rather than treating a revoked ancestor's link as authorization.
- Existing personal versions: As approved in S0-019, independently owned personal versions remain available for their owners after ordinary source-sharing withdrawal. Independently authorized re-sharing of personal versions follows S0-021; restrictions on direct references to the original are enforced separately under S0-SHARE-002.
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
- **Permission consistency:** If chapter tagging creates a durable private file as defined above, it requires private-save permission. The sharing UI must prevent contradictory combinations that would circumvent an owner's ban on private saving; owners may allow private saving while separately prohibiting chapter tagging.
- **Previously authorized copies:** A durable personal copy properly created when the sender allowed saving/tagging remains independent if access to the shared original is later withdrawn, consistent with S0-019. This does not override unlawful-content takedown or security/legal restrictions (to be separately specified).
- **Other permissions:** Do not conflate in-app **Save to Private Files** / **Tag to Chapter** with external **Download/Export**. Export remains subject to S0-023; edit-personal-version and re-sharing remain subject to S0-017/S0-020/S0-022 and the sharing-time configuration rule S0-SHARE-001.
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
- Security: Use protected app storage and isolate files by account. Offline capability does not promise technical prevention of screenshots, copying from the screen, or other external capture.
- Status: Approved for product specification; implementation not yet verified.

## S0-FILE-EDIT-001 — Original owners edit shared files inside CA Progress only

- Decision date: 2026-10-13
- Product owner clarification: **The original file's owner edits it in CA Progress; updating an existing shared original by uploading a replacement/new PDF is not allowed.**
- Policy: The owner or another user specifically authorized to edit the canonical original must make subsequent changes **using in-app file editing tools**. Changes update the canonical source's in-app revision state; do not expose an "Upload New PDF", "Replace Original PDF", or file-replacement flow as an update path for that existing shared original.
- Original versus personal copies: A source owner's authorized in-app edits may update the shared original without overriding recipients' independent personal versions (S0-017/S0-018). Recipients cannot write to the canonical original merely because they have permission to edit their personal copies.
- File types: For PDFs, provide the supported in-app editing capability (e.g. annotations and other permitted PDF modifications); exact editor functions are to be decided. If a file type cannot be edited in-app, do **not** silently use PDF re-upload as a replacement workaround.
- Scope: This restriction concerns **updating/replacing an already shared source file**, not the initial creation or upload of a new file.
- S0-029 resolves cache refresh after in-app edits: update the authorized original silently on reconnection, while preserving independent personal versions.
- Status: Approved product policy; implementation not yet verified.

## S0-029 — Automatically refresh cached originals after in-app source edits

- Decision date: 2026-10-13
- Product owner selection: **A — Update automatically in the background**
- Trigger: A canonical shared-file owner makes an authorized in-app edit to the original while an authorized recipient is offline with a temporary cached older revision; the recipient later reconnects.
- Policy: Automatically refresh the recipient's temporary cached original to the current authorized in-app revision in the background after reconnection, without a user prompt or manual file-opening requirement. Keep the identity of the original file consistent.
- Personal-version isolation: Independently saved student-owned copies, personal edits and chapter-attached private versions must **remain unchanged** (S0-018/S0-026).
- Authorization priority: Before refreshing, verify the student's current effective access via permitted share routes. If access has been revoked, do not fetch the new revision; remove temporary cache as approved in S0-027.
- Reliability: Use revision identifiers and integrity checking; install new cached content atomically when verified, with no broken/partially written PDF. Ensure sync is idempotent, retry on temporary failure under S0-011, and respects the background-only UI rule S0-SYNC-UI-001.
- Scope: Authorized in-app source revisions (S0-FILE-EDIT-001), never replacement by uploading a new PDF.
- Status: Approved for product specification; implementation not yet verified.

## Next pending scenario

S0-030: When local offline cached study materials use significant device storage, should CA Progress automatically remove older disposable cached files, only remove them when asked, or let the student choose which files stay offline?


