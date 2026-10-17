# Mobile Phase 9 — Community realtime and push

Phase 9 keeps mobile and desktop on the same Community APIs, D1 records and Cloudflare Durable Object. It adds visible connection state, reconnect-aware fallback refresh, channel presence, typing indicators, and cleanup when a socket leaves.

Web Push is opt-in per device. The browser requests permission only after the user presses Enable, stores an account-bound subscription in D1, and removes that subscription when disabled. The service worker accepts bounded notification payloads and only opens same-origin application paths.

## Production configuration

1. Apply retained D1 migration `0061`.
2. Configure `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` with the public VAPID application-server key.
3. Keep the matching private VAPID key only in the notification delivery worker secret store.
4. The existing notification outbox remains the source for provider delivery. Do not mark an outbox row delivered until the provider accepts it; revoke subscriptions on permanent provider responses.

When no public key is configured, the UI reports that delivery is unavailable and does not request browser permission or claim success. Existing in-app planner and Community notifications continue to work.

## Verification

Run `npm run test:mobile:phase9`, followed by the complete CI command. Phase 10 remains the mobile billing and app-store policy boundary.
