-- CA Progress V2 - one-time requested owner bootstrap.
-- Resolves the existing V2 auth user by email once, then stores the role by immutable user UUID.
-- No permanent email-based privilege trigger is left behind.

do $$
declare
  v_user_id uuid;
  v_before_role text;
  v_before_active boolean;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower('habeebaasif622@gmail.com')
  order by created_at asc
  limit 1;

  if v_user_id is null then
    raise exception 'Requested owner account habeebaasif622@gmail.com does not exist in the V2 auth project yet. Sign in once before applying this migration.';
  end if;

  select role, is_active into v_before_role, v_before_active
  from public.admin_users
  where user_id = v_user_id;

  insert into public.admin_users(user_id, role, is_active, granted_by)
  values(v_user_id, 'owner', true, null)
  on conflict(user_id) do update
    set role = 'owner', is_active = true, updated_at = now();

  if v_before_role is distinct from 'owner' or v_before_active is distinct from true then
    insert into public.admin_audit_logs(
      actor_user_id, actor_role, action_key, entity_type, entity_id,
      request_id, before_state, after_state, metadata
    ) values(
      null, 'system', 'admin.role_changed', 'admin_user', v_user_id::text,
      gen_random_uuid(),
      jsonb_build_object('role', v_before_role, 'is_active', v_before_active),
      jsonb_build_object('role', 'owner', 'is_active', true),
      jsonb_build_object('source', 'requested_owner_bootstrap')
    );
  end if;
end;
$$;
