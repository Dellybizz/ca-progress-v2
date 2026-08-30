create extension if not exists pgcrypto;

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  tier_key text not null check (tier_key in ('free','basic','pro')),
  billing_cycle text not null check (billing_cycle in ('free','monthly','annual')),
  name text not null,
  tagline text not null default '',
  rank integer not null check (rank >= 0),
  price_subunits bigint check (price_subunits is null or price_subunits >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  duration_value integer not null check (duration_value >= 0),
  duration_unit text not null check (duration_unit in ('day','week','month','year','lifetime')),
  active boolean not null default true,
  checkout_enabled boolean not null default false,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tier_key, billing_cycle),
  check ((billing_cycle = 'free' and tier_key = 'free' and price_subunits = 0 and duration_unit = 'lifetime') or (billing_cycle <> 'free' and tier_key <> 'free' and duration_value > 0 and duration_unit <> 'lifetime')),
  check (not checkout_enabled or (active and billing_cycle <> 'free' and price_subunits is not null and price_subunits >= 100))
);

create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  limit_value numeric,
  limit_unit text not null default 'unlimited' check (limit_unit in ('unlimited','count','minutes','megabytes')),
  reset_period text not null default 'never' check (reset_period in ('never','daily','weekly','monthly')),
  upgrade_message text not null default 'Upgrade your plan to use this feature.',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, feature_key),
  check ((limit_unit = 'unlimited' and limit_value is null) or (limit_unit <> 'unlimited' and limit_value is not null and limit_value >= 0))
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('active','cancelled','expired','paused')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  source text not null default 'razorpay' check (source in ('razorpay','manual','migration')),
  source_order_id text,
  source_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_order_id),
  check (ends_at is null or ends_at > starts_at)
);

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique,
  provider_payment_id text,
  receipt text not null unique,
  amount_subunits bigint not null check (amount_subunits > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'created' check (status in ('created','attempted','paid','failed','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references public.payment_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  source text not null check (source in ('verify','webhook')),
  event_type text not null,
  provider_event_key text not null,
  provider_order_id text not null,
  provider_payment_id text,
  provider_status text not null,
  amount_subunits bigint,
  currency text,
  verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_key)
);

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  payment_event_id uuid references public.payment_events(id),
  event_type text not null check (event_type in ('granted','extended','expired','cancelled','paused','resumed')),
  source text not null default 'payment',
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (payment_event_id, event_type)
);

create index subscription_plans_active_idx on public.subscription_plans(active, tier_key, billing_cycle);
create index plan_entitlements_feature_idx on public.plan_entitlements(feature_key, plan_id);
create index user_subscriptions_current_idx on public.user_subscriptions(user_id, status, starts_at, ends_at);
create index payment_orders_user_created_idx on public.payment_orders(user_id, created_at desc);
create index payment_events_user_created_idx on public.payment_events(user_id, created_at desc);
create index subscription_events_user_created_idx on public.subscription_events(user_id, created_at desc);

insert into public.subscription_plans(tier_key,billing_cycle,name,tagline,rank,price_subunits,currency,duration_value,duration_unit,active,checkout_enabled,sort_order)
values
('free','free','Free','Everything needed to keep your preparation moving.',0,0,'INR',0,'lifetime',true,false,10),
('basic','monthly','Basic','More storage and a paid-plan foundation for focused preparation.',10,null,'INR',1,'month',true,false,20),
('basic','annual','Basic','More storage and a paid-plan foundation for focused preparation.',10,null,'INR',1,'year',true,false,21),
('pro','monthly','Pro','Highest storage allowance with the full current V2 study toolkit.',20,null,'INR',1,'month',true,false,30),
('pro','annual','Pro','Highest storage allowance with the full current V2 study toolkit.',20,null,'INR',1,'year',true,false,31);

with rules(tier_key,feature_key,enabled,limit_value,limit_unit,reset_period,upgrade_message) as (
 values
 ('free','core.product',true,null::numeric,'unlimited','never',''),
 ('free','planner.smart',true,null,'unlimited','never','Upgrade to keep using Smart Planner if your plan configuration changes.'),
 ('free','analytics.forecast',true,null,'unlimited','never','Upgrade to keep using completion forecasts if your plan configuration changes.'),
 ('free','community.attachments',true,null,'unlimited','never','Upgrade to keep sharing approved Community resources if your plan configuration changes.'),
 ('free','resources.storage',true,100,'megabytes','never','Upgrade for more private file storage.'),
 ('free','billing.paid',false,0,'count','never','Choose Basic or Pro to unlock paid-plan benefits.'),
 ('basic','core.product',true,null,'unlimited','never',''),
 ('basic','planner.smart',true,null,'unlimited','never',''),
 ('basic','analytics.forecast',true,null,'unlimited','never',''),
 ('basic','community.attachments',true,null,'unlimited','never',''),
 ('basic','resources.storage',true,1024,'megabytes','never','Upgrade to Pro for more private file storage.'),
 ('basic','billing.paid',true,null,'unlimited','never',''),
 ('pro','core.product',true,null,'unlimited','never',''),
 ('pro','planner.smart',true,null,'unlimited','never',''),
 ('pro','analytics.forecast',true,null,'unlimited','never',''),
 ('pro','community.attachments',true,null,'unlimited','never',''),
 ('pro','resources.storage',true,5120,'megabytes','never',''),
 ('pro','billing.paid',true,null,'unlimited','never','')
)
insert into public.plan_entitlements(plan_id,feature_key,enabled,limit_value,limit_unit,reset_period,upgrade_message)
select p.id,r.feature_key,r.enabled,r.limit_value,r.limit_unit,r.reset_period,r.upgrade_message
from public.subscription_plans p join rules r on r.tier_key=p.tier_key;

create or replace function public.phase11_add_plan_duration(p_base timestamptz, p_value integer, p_unit text)
returns timestamptz language plpgsql immutable set search_path=public as $$
begin
  if p_unit='lifetime' then return null; end if;
  if p_value is null or p_value <= 0 then raise exception 'Invalid plan duration'; end if;
  case p_unit
    when 'day' then return p_base + make_interval(days => p_value);
    when 'week' then return p_base + make_interval(days => p_value * 7);
    when 'month' then return p_base + make_interval(months => p_value);
    when 'year' then return p_base + make_interval(years => p_value);
    else raise exception 'Unsupported plan duration unit';
  end case;
end; $$;

create or replace function public.phase11_current_plan_id(p_user_id uuid)
returns uuid language sql stable security definer set search_path=public,auth as $$
  select coalesce(
    (select us.plan_id from public.user_subscriptions us
      join public.subscription_plans p on p.id=us.plan_id
      where us.user_id=p_user_id and us.status='active' and us.starts_at<=now()
        and (us.ends_at is null or us.ends_at>now()) and p.active
      order by p.rank desc, us.ends_at desc nulls first, us.created_at desc limit 1),
    (select id from public.subscription_plans where tier_key='free' and billing_cycle='free' and active limit 1)
  );
$$;

create or replace function public.phase11_effective_entitlement(p_user_id uuid,p_feature_key text)
returns table(plan_id uuid,tier_key text,plan_name text,feature_key text,allowed boolean,limit_value numeric,limit_unit text,reset_period text,upgrade_message text)
language sql stable security definer set search_path=public,auth as $$
  select p.id,p.tier_key,p.name,e.feature_key,e.enabled,e.limit_value,e.limit_unit,e.reset_period,e.upgrade_message
  from public.subscription_plans p
  join public.plan_entitlements e on e.plan_id=p.id
  where p.id=public.phase11_current_plan_id(p_user_id) and e.feature_key=p_feature_key
  limit 1;
$$;

create or replace function public.phase11_get_my_entitlement(p_feature_key text)
returns table(plan_id uuid,tier_key text,plan_name text,feature_key text,allowed boolean,limit_value numeric,limit_unit text,reset_period text,upgrade_message text)
language sql stable security definer set search_path=public,auth as $$
  select * from public.phase11_effective_entitlement(auth.uid(),p_feature_key);
$$;

create or replace function public.phase11_reconcile_payment(
 p_provider_order_id text,p_provider_payment_id text,p_amount_subunits bigint,p_currency text,p_provider_status text,p_source text,p_event_type text,p_provider_event_key text,p_paid_at timestamptz,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 v_order public.payment_orders%rowtype; v_plan public.subscription_plans%rowtype; v_event_id uuid; v_existing_event public.payment_events%rowtype; v_current record; v_start timestamptz; v_end timestamptz; v_subscription_id uuid; v_event_kind text;
begin
 if p_source not in ('verify','webhook') then raise exception 'Invalid payment event source'; end if;
 select * into v_order from public.payment_orders where provider_order_id=p_provider_order_id for update;
 if not found then raise exception 'Payment order not found'; end if;
 if p_amount_subunits is distinct from v_order.amount_subunits then raise exception 'Payment amount mismatch'; end if;
 if upper(p_currency) is distinct from upper(v_order.currency) then raise exception 'Payment currency mismatch'; end if;
 if p_provider_status not in ('created','authorized','captured','refunded','failed') then raise exception 'Unexpected payment status'; end if;
 insert into public.payment_events(payment_order_id,user_id,provider,source,event_type,provider_event_key,provider_order_id,provider_payment_id,provider_status,amount_subunits,currency,verified,payload)
 values(v_order.id,v_order.user_id,'razorpay',p_source,p_event_type,p_provider_event_key,p_provider_order_id,p_provider_payment_id,p_provider_status,p_amount_subunits,upper(p_currency),true,coalesce(p_payload,'{}'::jsonb))
 on conflict(provider,provider_event_key) do nothing returning id into v_event_id;
 if v_event_id is null then
   select * into v_existing_event from public.payment_events where provider='razorpay' and provider_event_key=p_provider_event_key;
   return jsonb_build_object('ok',true,'duplicate',true,'orderId',v_order.id,'paymentEventId',v_existing_event.id,'status',v_order.status);
 end if;
 if p_provider_status='failed' then
   if v_order.status<>'paid' then update public.payment_orders set status='failed',provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),updated_at=now() where id=v_order.id; end if;
   return jsonb_build_object('ok',true,'duplicate',false,'status','failed','paymentEventId',v_event_id);
 end if;
 if p_provider_status<>'captured' then
   update public.payment_orders set status='attempted',provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),updated_at=now() where id=v_order.id and status='created';
   return jsonb_build_object('ok',true,'duplicate',false,'status','pending','providerStatus',p_provider_status,'paymentEventId',v_event_id);
 end if;
 select * into v_plan from public.subscription_plans where id=v_order.plan_id and active;
 if not found or v_plan.tier_key='free' or v_plan.billing_cycle='free' then raise exception 'Paid plan is unavailable'; end if;
 select us.id,us.ends_at,p.tier_key into v_current from public.user_subscriptions us join public.subscription_plans p on p.id=us.plan_id
 where us.user_id=v_order.user_id and us.status='active' and us.starts_at<=coalesce(p_paid_at,now()) and us.ends_at>coalesce(p_paid_at,now()) and p.tier_key=v_plan.tier_key
 order by us.ends_at desc limit 1;
 if found then v_start=v_current.ends_at; v_event_kind='extended'; else v_start=coalesce(p_paid_at,now()); v_event_kind='granted'; end if;
 v_end=public.phase11_add_plan_duration(v_start,v_plan.duration_value,v_plan.duration_unit);
 insert into public.user_subscriptions(user_id,plan_id,status,starts_at,ends_at,source,source_order_id,source_payment_id)
 values(v_order.user_id,v_plan.id,'active',v_start,v_end,'razorpay',v_order.provider_order_id,p_provider_payment_id)
 on conflict(source,source_order_id) do update set source_payment_id=excluded.source_payment_id,updated_at=now() returning id into v_subscription_id;
 insert into public.subscription_events(subscription_id,user_id,plan_id,payment_event_id,event_type,source,starts_at,ends_at,metadata)
 values(v_subscription_id,v_order.user_id,v_plan.id,v_event_id,v_event_kind,p_source,v_start,v_end,jsonb_build_object('provider_order_id',v_order.provider_order_id,'provider_payment_id',p_provider_payment_id))
 on conflict(payment_event_id,event_type) do nothing;
 update public.payment_orders set status='paid',provider_payment_id=p_provider_payment_id,paid_at=coalesce(p_paid_at,now()),updated_at=now() where id=v_order.id;
 return jsonb_build_object('ok',true,'duplicate',false,'status','active','subscriptionId',v_subscription_id,'tier',v_plan.tier_key,'startsAt',v_start,'endsAt',v_end,'paymentEventId',v_event_id);
end; $$;

alter table public.subscription_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payment_orders enable row level security;
alter table public.payment_events enable row level security;
alter table public.subscription_events enable row level security;
create policy phase11_plans_public_read on public.subscription_plans for select using (active);
create policy phase11_entitlements_public_read on public.plan_entitlements for select using (exists(select 1 from public.subscription_plans p where p.id=plan_id and p.active));
create policy phase11_subscriptions_read_own on public.user_subscriptions for select to authenticated using (user_id=auth.uid());
create policy phase11_payment_orders_read_own on public.payment_orders for select to authenticated using (user_id=auth.uid());
create policy phase11_payment_events_read_own on public.payment_events for select to authenticated using (user_id=auth.uid());
create policy phase11_subscription_events_read_own on public.subscription_events for select to authenticated using (user_id=auth.uid());
grant select on public.subscription_plans,public.plan_entitlements to anon,authenticated;
grant select on public.user_subscriptions,public.payment_orders,public.payment_events,public.subscription_events to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.subscription_plans,public.plan_entitlements,public.user_subscriptions,public.payment_orders,public.payment_events,public.subscription_events from anon,authenticated;
revoke all on function public.phase11_add_plan_duration(timestamptz,integer,text) from public,anon,authenticated;
revoke all on function public.phase11_current_plan_id(uuid) from public,anon,authenticated;
revoke all on function public.phase11_effective_entitlement(uuid,text) from public,anon,authenticated;
revoke all on function public.phase11_reconcile_payment(text,text,bigint,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.phase11_add_plan_duration(timestamptz,integer,text) to service_role;
grant execute on function public.phase11_current_plan_id(uuid) to service_role;
grant execute on function public.phase11_effective_entitlement(uuid,text) to service_role;
grant execute on function public.phase11_reconcile_payment(text,text,bigint,text,text,text,text,text,timestamptz,jsonb) to service_role;
revoke all on function public.phase11_get_my_entitlement(text) from public,anon;
grant execute on function public.phase11_get_my_entitlement(text) to authenticated;

insert into public.app_settings(key,value) values ('billing.phase11',jsonb_build_object('provider','razorpay','currency','INR','pricing_source','server_plan_rows','provider_verify',true,'webhook_reconcile',true,'idempotent_subscription_events',true,'paid_checkout_default','disabled_until_pricing_and_secrets_configured')) on conflict(key) do update set value=excluded.value,updated_at=now();
insert into public.app_settings(key,value) values ('app.phase','{"phase":11,"status":"plans_entitlements_billing_razorpay"}'::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now();
