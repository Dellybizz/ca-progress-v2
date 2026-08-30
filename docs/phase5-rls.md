# RLS behavior

Authenticated selects are restricted to `user_id = auth.uid()`. Anonymous access is revoked. Authenticated direct writes are revoked so dependency/application checks cannot be skipped by using PostgREST directly.
