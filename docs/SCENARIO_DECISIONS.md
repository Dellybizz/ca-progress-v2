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

## Next pending scenario

S0-003: At the end of the 30-day Trash retention period, what should happen, and should the student receive any warning before permanent deletion?

