# Database acceptance verification

A rolled-back transaction against the isolated V2 Supabase project verified:

- Revision 1 before Completed is rejected by the database.
- Saving two different applicable chapters leaves two independent rows present.
- Accepted saves append progress history events.

The transaction was rolled back so this verification did not alter the student's actual progress.
