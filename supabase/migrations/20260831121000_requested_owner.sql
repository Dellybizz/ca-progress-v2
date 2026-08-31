-- CA Progress V2 - requested owner bootstrap.
-- Keeps the role in the Phase 12 admin_users source of truth instead of trusting browser/JWT state.

create or replace function public.phase12_set_requested_owner(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_before_role text;
  v_before_active boolean;
begin
  select role, is_active into v_before_role, v_before_active
  from public.admin_users
  where user_id = p_user_id;

  insert into public.admin_users(user_id, role, is_active, granted_by)
  values(p_user_id, 'owner', true, null)
  on conflict(user_id) do update
    set role = 'owner', is_active = true, updated_at = now();

  if v_before_role is distinct from 'owner' or v_before_active is distinct from true then
    insert into public.admin_audit_logs(
      actor_user_id, actor_role, action_key, entity_type, entity_id,
      request_id, before_state, after_state, metadata
    ) values(
      null, 'system', 'admin.role_changed', 'admin_user', p_user_id::text,
      gen_random_uuid(),
      jsonb_build_object('role', v_before_role, 'is_active', v_before_active),
      jsonb_build_object('role', 'owner', 'is_active', true),
      jsonb_build_object('source', 'requested_owner_bootstrap')
    );
  end if;
end;
$$;

create or replace function public.phase12_apply_requested_owner()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if lower(coalesce(new.email, '')) = lower('habeebaasif622@gmail.com') then
    perform public.phase12_set_requested_owner(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.phase12_set_requested_owner(uuid) from public, anon, authenticated;
revoke all on function public.phase12_apply_requested_owner() from public, anon, authenticated;

drop trigger if exists phase12_requested_owner_after_auth_user on auth.users;
create trigger phase12_requested_owner_after_auth_user
after insert or update of email on auth.users
for each row execute function public.phase12_apply_requested_owner();

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower('habeebaasif622@gmail.com')
  order by created_at asc
  limit 1;

  if v_user_id is not null then
    perform public.phase12_set_requested_owner(v_user_id);
  end if;
end;
$$;
