# Native auth deployment recovery

This marker intentionally has no runtime effect.

It exists to retrigger the Cloudflare deployment after a previous native-auth rollout was cancelled by the stale-deployment guard when a mobile-only commit advanced the branch head.
