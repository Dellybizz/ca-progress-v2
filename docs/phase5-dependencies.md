# Stage dependencies

- Completed unlocks Revision 1 and Test 1.
- Revision 1 unlocks Revision 2.
- Test 1 unlocks Test 2.
- A prerequisite cannot be cleared while a dependent stage remains set.

The UI communicates these locks, but the database RPC is authoritative and rejects bypass attempts.
