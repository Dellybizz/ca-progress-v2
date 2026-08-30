# Phase 5 security boundaries

- Guest users cannot read or write private progress rows.
- Authenticated users can select only rows where `user_id = auth.uid()`.
- Direct authenticated inserts/updates/deletes are revoked.
- Mutation functions derive identity from `auth.uid()` and validate chapter applicability from the signed-in profile, attempt syllabus mapping and group selection.
- Undo requires ownership and refuses to restore an older state when a newer chapter change exists.
