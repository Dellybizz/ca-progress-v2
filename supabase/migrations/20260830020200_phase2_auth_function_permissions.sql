-- Phase 2 auth trigger hardening.
-- The trigger must run only as an auth.users trigger, never as a public PostgREST RPC.

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
