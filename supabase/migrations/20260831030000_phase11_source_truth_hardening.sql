-- CA Progress V2 Phase 11
-- Source-of-truth hardening for configurable commercial values.
--
-- The detailed Phase 11 plan intentionally leaves paid prices and numeric
-- storage allowances configurable. Earlier Phase 11 staging work seeded
-- placeholder storage quantities. Preserve the migration audit trail and
-- correct those values forward rather than editing an already-applied file.

alter table public.plan_entitlements
  add column if not exists configured boolean not null default true;

comment on column public.plan_entitlements.configured is
  'False when an entitlement exists structurally but its commercial/resource allowance still requires an approved server-side value.';

-- No Free/Basic/Pro numeric storage allowance is approved in the Phase 11
-- source of truth. Null + configured=false means "not configured", not
-- "unlimited". The existing secure Phase 7 storage architecture remains in
-- place until an approved quota is set.
update public.plan_entitlements
set configured = false,
    limit_value = null,
    limit_unit = 'unlimited'
where feature_key = 'resources.storage';

-- Paid checkout must stay disabled until a positive server-side price exists.
update public.subscription_plans
set checkout_enabled = false
where tier_key in ('basic', 'pro')
  and (price_subunits is null or price_subunits <= 0);

-- Private billing rows should not even be table-readable by the anonymous
-- PostgREST role. Authenticated users retain read-only access to their own rows
-- through RLS; all mutations remain service-role/server-only.
revoke all on table public.user_subscriptions from anon;
revoke all on table public.payment_orders from anon;
revoke all on table public.payment_events from anon;
revoke all on table public.subscription_events from anon;

grant select on table public.subscription_plans to anon, authenticated;
grant select on table public.plan_entitlements to anon, authenticated;
grant select on table public.user_subscriptions to authenticated;
grant select on table public.payment_orders to authenticated;
grant select on table public.payment_events to authenticated;
grant select on table public.subscription_events to authenticated;

-- A provider payment can settle only one local order. This supplements the
-- provider-order idempotency guard and prevents accidental reuse of one
-- Razorpay payment id across separate local rows.
create unique index if not exists payment_orders_provider_payment_uidx
  on public.payment_orders(provider, provider_payment_id)
  where provider_payment_id is not null;
