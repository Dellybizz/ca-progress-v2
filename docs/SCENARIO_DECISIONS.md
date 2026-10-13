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

## Next pending scenario

S0-004: Should students be allowed to manually and permanently delete items from Trash before their 30-day automatic expiration?

