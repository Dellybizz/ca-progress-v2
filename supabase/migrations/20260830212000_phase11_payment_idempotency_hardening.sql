-- A verify callback and Razorpay webhook may describe the same captured payment.
-- Keep both audit events, but a provider order may grant/extend entitlement only once.
create or replace function public.phase11_reconcile_payment(
 p_provider_order_id text,p_provider_payment_id text,p_amount_subunits bigint,p_currency text,p_provider_status text,p_source text,p_event_type text,p_provider_event_key text,p_paid_at timestamptz,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 v_order public.payment_orders%rowtype; v_plan public.subscription_plans%rowtype; v_event_id uuid; v_existing_event public.payment_events%rowtype; v_existing_subscription public.user_subscriptions%rowtype; v_current record; v_start timestamptz; v_end timestamptz; v_subscription_id uuid; v_event_kind text;
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
   return jsonb_build_object('ok',true,'duplicateDelivery',true,'entitlementChanged',false,'orderId',v_order.id,'paymentEventId',v_existing_event.id,'status',v_order.status);
 end if;
 if p_provider_status='failed' then
   if v_order.status<>'paid' then update public.payment_orders set status='failed',provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),updated_at=now() where id=v_order.id; end if;
   return jsonb_build_object('ok',true,'duplicateDelivery',false,'entitlementChanged',false,'status','failed','paymentEventId',v_event_id);
 end if;
 if p_provider_status<>'captured' then
   update public.payment_orders set status='attempted',provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),updated_at=now() where id=v_order.id and status='created';
   return jsonb_build_object('ok',true,'duplicateDelivery',false,'entitlementChanged',false,'status','pending','providerStatus',p_provider_status,'paymentEventId',v_event_id);
 end if;
 select * into v_existing_subscription from public.user_subscriptions where source='razorpay' and source_order_id=v_order.provider_order_id;
 if found then
   update public.payment_orders set status='paid',provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),paid_at=coalesce(p_paid_at,paid_at,now()),updated_at=now() where id=v_order.id;
   return jsonb_build_object('ok',true,'duplicateDelivery',false,'entitlementChanged',false,'alreadyGranted',true,'status','active','subscriptionId',v_existing_subscription.id,'startsAt',v_existing_subscription.starts_at,'endsAt',v_existing_subscription.ends_at,'paymentEventId',v_event_id);
 end if;
 select * into v_plan from public.subscription_plans where id=v_order.plan_id and active;
 if not found or v_plan.tier_key='free' or v_plan.billing_cycle='free' then raise exception 'Paid plan is unavailable'; end if;
 select us.id,us.ends_at,p.tier_key into v_current from public.user_subscriptions us join public.subscription_plans p on p.id=us.plan_id
 where us.user_id=v_order.user_id and us.status='active' and us.starts_at<=coalesce(p_paid_at,now()) and us.ends_at>coalesce(p_paid_at,now()) and p.tier_key=v_plan.tier_key
 order by us.ends_at desc limit 1;
 if found then v_start=v_current.ends_at; v_event_kind='extended'; else v_start=coalesce(p_paid_at,now()); v_event_kind='granted'; end if;
 v_end=public.phase11_add_plan_duration(v_start,v_plan.duration_value,v_plan.duration_unit);
 insert into public.user_subscriptions(user_id,plan_id,status,starts_at,ends_at,source,source_order_id,source_payment_id)
 values(v_order.user_id,v_plan.id,'active',v_start,v_end,'razorpay',v_order.provider_order_id,p_provider_payment_id) returning id into v_subscription_id;
 insert into public.subscription_events(subscription_id,user_id,plan_id,payment_event_id,event_type,source,starts_at,ends_at,metadata)
 values(v_subscription_id,v_order.user_id,v_plan.id,v_event_id,v_event_kind,p_source,v_start,v_end,jsonb_build_object('provider_order_id',v_order.provider_order_id,'provider_payment_id',p_provider_payment_id));
 update public.payment_orders set status='paid',provider_payment_id=p_provider_payment_id,paid_at=coalesce(p_paid_at,now()),updated_at=now() where id=v_order.id;
 return jsonb_build_object('ok',true,'duplicateDelivery',false,'entitlementChanged',true,'status','active','subscriptionId',v_subscription_id,'tier',v_plan.tier_key,'startsAt',v_start,'endsAt',v_end,'paymentEventId',v_event_id);
end; $$;
revoke all on function public.phase11_reconcile_payment(text,text,bigint,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.phase11_reconcile_payment(text,text,bigint,text,text,text,text,text,timestamptz,jsonb) to service_role;
