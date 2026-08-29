-- CA Progress V2 - Phase 1 UI preferences contract
-- Persistence exists now so later identity work can use a stable schema without redesigning the UI contract.

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  accent text not null default 'indigo' check (accent in ('indigo', 'violet', 'emerald', 'rose')),
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  reduce_motion boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
alter table public.user_preferences enable row level security;
create policy "user_preferences_select_own" on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_preferences_insert_own" on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_preferences_update_own" on public.user_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_preferences_delete_own" on public.user_preferences for delete to authenticated using ((select auth.uid()) = user_id);
comment on table public.user_preferences is 'Phase 1 UI preference contract. Auth/profile flows begin in Phase 2.';
