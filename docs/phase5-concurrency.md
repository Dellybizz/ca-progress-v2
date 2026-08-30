# Chapter-granular concurrency

`progress_set_stage` inserts/locks only the target `(user_id, chapter_id)` row. It never reads a single serialized progress document and never replaces another chapter's state. This is the core multi-device concurrency guarantee for Phase 5.
