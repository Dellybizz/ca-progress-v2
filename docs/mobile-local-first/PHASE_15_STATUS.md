# Phase 15 status — native authentication and device sessions

Phase 15 adds native Google and LinkedIn OAuth through the system browser with device-generated PKCE. The callback contains only a one-time exchange code; the bearer token is returned by the exchange API and stored only in Android Keystore-backed encrypted storage or iOS Keychain.

The website continues to use its HTTP-only cookie. Native bearer and web-cookie requests share the same D1 application user and authorization path. Native sessions carry their client kind, device label, build, sliding expiry and absolute expiry, and can be revoked for the current device or all other devices.

The app still renders the installed Phase 14 shell first. Phase 16, not this phase, introduces account-scoped SQLite and synchronized local data.

## Security closure

- No raw bearer token is placed in a URL, D1, localStorage, Preferences or SQLite.
- Exchange codes are hashed, expire after ten minutes and are consumed atomically once.
- The PKCE verifier is retained under a separate Keystore/Keychain key for the browser round-trip.
- Native CORS accepts only Capacitor loopback origins; browser cookie mutations retain same-origin CSRF enforcement.
- Logout revokes the server session before deleting device credentials.

Real-device Google and LinkedIn completion remains a release acceptance check because it requires configured provider credentials and installed Android/iOS applications.
