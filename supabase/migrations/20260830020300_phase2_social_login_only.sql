-- CA Progress V2 - Phase 2 auth provider revision
-- Phone OTP was removed from the product authentication surface in favor of Google + LinkedIn (OIDC).
-- Apply only to the isolated V2 Supabase project.

drop table if exists public.auth_otp_rate_limits;
