# Authentication Phase 6: live certification

The Phase 6 workflow deploys the exact branch commit, then runs `scripts/auth/certify-phase6-live.mjs` against the live Worker and D1. It provisions a unique `manual-test` fixture, tests that public registration is rejected, incorrect passwords fail, web and Android-style bearer logins return the same owner ID, the remembered session is marked, username/password changes preserve ownership, other sessions are revoked after password change, an individual session needs the password to be revoked, and all-session sign-out invalidates the final token.

The fixture is marked disabled and its sessions revoked in a `finally` block. It is retained solely because append-only audit events prevent clean deletion; no existing user is modified. The workflow asserts pre-existing account and owned-record counts do not decrease and checks D1 foreign keys. Its artifact contains only outcomes and counts; no password, cookie, token or hash.

This checks HTTP contracts against a controlled password fixture. Google/LinkedIn provider consent, account setup by a real linked student, and install/update/uninstall behavior on a physical Android device remain outside this automated certification. A device install and linked-provider test are required before claiming those end-to-end flows have been proven.
