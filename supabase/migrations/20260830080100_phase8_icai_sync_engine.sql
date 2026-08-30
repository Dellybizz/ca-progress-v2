-- CA Progress V2 - Phase 8 ICAI Daily Update & Verification Engine
-- Apply only to the isolated V2 Supabase project.
-- Official ICAI resource bodies are never copied into platform storage; only metadata, provenance and hashes are stored.

create table public.icai_sources (
  id text primary key,
  name text not null,
  source_type text not null check (source_type in ('exam_feed', 'bos_feed', 'resource_hub', 'course_hub')),
  official_url text not null unique,
  adapter_key text not null check (adapter_key in ('anchor_feed', 'resource_hub')),
  level_codes text[] not null default '{}'::text[],
  resource_types text[] not null default '{}'::text[],
  trust_level text not null default 'standard' check (trust_level in ('standard', 'high_impact')),
  authoritative_listing boolean not null default false,
  adapter_config jsonb not null default '{}'::jsonb,
  parser_version text not null default 'phase8.1',
  request_interval_seconds integer not null default 1 check (request_interval_seconds between 0 and 300),
  timeout_ms integer not null default 12000 check (timeout_ms between 1000 and 30000),
  is_active boolean not null default true,
  last_content_hash text,
  etag text,
  last_modified text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.icai_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('cron', 'manual', 'test')),
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  parser_version text not null,
  source_total integer not null default 0,
  source_processed integer not null default 0,
  source_succeeded integer not null default 0,
  source_failed integer not null default 0,
  new_items integer not null default 0,
  changed_items integer not null default 0,
  unchanged_items integer not null default 0,
  removed_items integer not null default 0,
  pending_reviews integer not null default 0,
  error_summary text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index icai_single_running_sync_idx on public.icai_sync_runs ((true)) where status = 'running';

create table public.icai_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.icai_sync_runs(id) on delete restrict,
  source_id text not null references public.icai_sources(id) on delete restrict,
  fetched_at timestamptz not null default now(),
  http_status integer not null check (http_status between 100 and 599),
  canonical_hash text not null,
  content_length integer,
  etag text,
  last_modified text,
  parser_version text not null,
  parsed_item_count integer not null default 0,
  is_changed boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, source_id)
);

create table public.exam_attempts (
  id text primary key,
  level_id text not null references public.course_levels(id) on delete restrict,
  attempt_key text not null,
  label text not null,
  start_date date,
  end_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'completed', 'cancelled')),
  verification_status text not null default 'verified' check (verification_status in ('verified', 'pending_review', 'rejected')),
  verification_method text not null default 'official_sync' check (verification_method in ('phase3_verified_bootstrap', 'official_sync', 'admin_review')),
  source_id text references public.icai_sources(id) on delete restrict,
  source_url text not null,
  source_snapshot_id uuid references public.icai_source_snapshots(id) on delete restrict,
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  unique (level_id, attempt_key)
);

create table public.exam_events (
  id text primary key,
  attempt_id text not null references public.exam_attempts(id) on delete restrict,
  event_type text not null check (event_type in ('exam_start', 'exam_end', 'exam_paper', 'application_open', 'application_close', 'result', 'schedule_release')),
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  subject_id text references public.subjects(id) on delete restrict,
  verification_status text not null default 'verified' check (verification_status in ('verified', 'pending_review', 'rejected')),
  source_id text not null references public.icai_sources(id) on delete restrict,
  source_url text not null,
  source_snapshot_id uuid references public.icai_source_snapshots(id) on delete restrict,
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.icai_resources (
  id text primary key,
  resource_type text not null check (resource_type in ('rtp', 'mtp', 'study_material', 'statutory_update', 'amendment', 'question_paper', 'suggested_answer', 'schedule', 'announcement')),
  title text not null,
  summary text,
  official_url text not null,
  source_id text not null references public.icai_sources(id) on delete restrict,
  source_snapshot_id uuid references public.icai_source_snapshots(id) on delete restrict,
  published_on date,
  status text not null default 'active' check (status in ('active', 'removed', 'replaced')),
  verification_status text not null default 'verified' check (verification_status in ('verified', 'pending_review', 'rejected')),
  replaced_by_resource_id text references public.icai_resources(id) on delete restrict,
  content_hash text not null,
  parser_version text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, official_url)
);

create table public.resource_attempt_map (
  resource_id text not null references public.icai_resources(id) on delete cascade,
  attempt_id text not null references public.exam_attempts(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (resource_id, attempt_id)
);

create table public.resource_subject_map (
  resource_id text not null references public.icai_resources(id) on delete cascade,
  subject_id text not null references public.subjects(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (resource_id, subject_id)
);

create table public.icai_change_events (
  id bigint generated by default as identity primary key,
  run_id uuid not null references public.icai_sync_runs(id) on delete restrict,
  source_id text not null references public.icai_sources(id) on delete restrict,
  entity_type text not null check (entity_type in ('resource', 'exam_attempt', 'exam_event')),
  entity_id text not null,
  change_type text not null check (change_type in ('created', 'changed', 'removed', 'replaced')),
  field_name text,
  old_value jsonb,
  new_value jsonb,
  risk_level text not null default 'normal' check (risk_level in ('normal', 'high')),
  decision_status text not null check (decision_status in ('auto_applied', 'pending_review', 'approved', 'rejected')),
  detected_at timestamptz not null default now(),
  applied_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text
);

create table public.icai_review_queue (
  id uuid primary key default gen_random_uuid(),
  change_event_id bigint not null unique references public.icai_change_events(id) on delete restrict,
  run_id uuid not null references public.icai_sync_runs(id) on delete restrict,
  source_id text not null references public.icai_sources(id) on delete restrict,
  entity_type text not null check (entity_type in ('exam_attempt', 'exam_event')),
  entity_id text not null,
  title text not null,
  reason text not null,
  confidence numeric(4,3) not null default 0.850 check (confidence >= 0 and confidence <= 1),
  proposed_patch jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index icai_sources_active_idx on public.icai_sources (is_active, source_type);
create index icai_sync_runs_started_idx on public.icai_sync_runs (started_at desc);
create index icai_snapshots_source_idx on public.icai_source_snapshots (source_id, fetched_at desc);
create index exam_attempts_level_status_idx on public.exam_attempts (level_id, status, attempt_key);
create index exam_events_attempt_date_idx on public.exam_events (attempt_id, event_date);
create index exam_events_subject_idx on public.exam_events (subject_id, event_date);
create index icai_resources_type_seen_idx on public.icai_resources (resource_type, last_seen_at desc);
create index icai_resources_source_idx on public.icai_resources (source_id, status, last_seen_at desc);
create index resource_attempt_attempt_idx on public.resource_attempt_map (attempt_id, resource_id);
create index resource_subject_subject_idx on public.resource_subject_map (subject_id, resource_id);
create index icai_change_events_entity_idx on public.icai_change_events (entity_type, entity_id, detected_at desc);
create index icai_review_queue_status_idx on public.icai_review_queue (status, created_at);

create trigger icai_sources_set_updated_at before update on public.icai_sources for each row execute function public.set_updated_at();
create trigger exam_attempts_set_updated_at before update on public.exam_attempts for each row execute function public.set_updated_at();
create trigger exam_events_set_updated_at before update on public.exam_events for each row execute function public.set_updated_at();
create trigger icai_resources_set_updated_at before update on public.icai_resources for each row execute function public.set_updated_at();
create trigger icai_review_queue_set_updated_at before update on public.icai_review_queue for each row execute function public.set_updated_at();

alter table public.icai_sources enable row level security;
alter table public.icai_sync_runs enable row level security;
alter table public.icai_source_snapshots enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_events enable row level security;
alter table public.icai_resources enable row level security;
alter table public.resource_attempt_map enable row level security;
alter table public.resource_subject_map enable row level security;
alter table public.icai_change_events enable row level security;
alter table public.icai_review_queue enable row level security;

create policy "icai_sources_read_active" on public.icai_sources for select to anon, authenticated using (is_active = true);
create policy "exam_attempts_read_verified" on public.exam_attempts for select to anon, authenticated using (verification_status = 'verified');
create policy "exam_events_read_verified" on public.exam_events for select to anon, authenticated using (verification_status = 'verified');
create policy "icai_resources_read_verified" on public.icai_resources for select to anon, authenticated using (verification_status = 'verified');
create policy "resource_attempt_map_read" on public.resource_attempt_map for select to anon, authenticated using (exists (select 1 from public.icai_resources r join public.exam_attempts a on a.id = resource_attempt_map.attempt_id where r.id = resource_attempt_map.resource_id and r.verification_status = 'verified' and a.verification_status = 'verified'));
create policy "resource_subject_map_read" on public.resource_subject_map for select to anon, authenticated using (exists (select 1 from public.icai_resources r where r.id = resource_subject_map.resource_id and r.verification_status = 'verified'));

grant select on public.icai_sources, public.exam_attempts, public.exam_events, public.icai_resources, public.resource_attempt_map, public.resource_subject_map to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.icai_sources, public.exam_attempts, public.exam_events, public.icai_resources, public.resource_attempt_map, public.resource_subject_map from anon, authenticated;
revoke all on public.icai_sync_runs, public.icai_source_snapshots, public.icai_change_events, public.icai_review_queue from anon, authenticated;

insert into public.icai_sources (id, name, source_type, official_url, adapter_key, level_codes, resource_types, trust_level, authoritative_listing, adapter_config) values
('icai-examination-students', 'ICAI Examination - Student Announcements', 'exam_feed', 'https://www.icai.org/category/examination-students', 'anchor_feed', array['foundation','intermediate','final'], array['schedule','announcement','question_paper','suggested_answer'], 'high_impact', false, '{"include_announcements":true}'::jsonb),
('icai-bos-important', 'ICAI BoS Important Announcements', 'bos_feed', 'https://www.icai.org/category/bos-important-announcements', 'anchor_feed', array['foundation','intermediate','final'], array['rtp','mtp','study_material','statutory_update','amendment','announcement'], 'standard', false, '{"include_announcements":true}'::jsonb),
('boslive-announcements', 'ICAI BoS Knowledge Portal Announcements', 'bos_feed', 'https://boslive.icai.org/bos_announcement.php', 'anchor_feed', array['foundation','intermediate','final'], array['rtp','mtp','study_material','statutory_update','amendment','announcement'], 'standard', false, '{"include_announcements":true}'::jsonb),
('icai-study-material-hub', 'ICAI Study Material - New Scheme', 'resource_hub', 'https://www.icai.org/post/study-material-nset', 'resource_hub', array['foundation','intermediate','final'], array['study_material','statutory_update','amendment'], 'standard', true, '{}'::jsonb),
('icai-foundation-course', 'ICAI Foundation Course - New Scheme', 'course_hub', 'https://www.icai.org/post/foundation-nset', 'resource_hub', array['foundation'], array['study_material','rtp','mtp','question_paper','suggested_answer','amendment'], 'standard', true, '{}'::jsonb),
('icai-intermediate-course', 'ICAI Intermediate Course - New Scheme', 'course_hub', 'https://www.icai.org/post/intermediate-nset', 'resource_hub', array['intermediate'], array['study_material','rtp','mtp','question_paper','suggested_answer','statutory_update','amendment'], 'standard', true, '{}'::jsonb),
('icai-final-course', 'ICAI Final Course - New Scheme', 'course_hub', 'https://www.icai.org/post/final-nset', 'resource_hub', array['final'], array['study_material','rtp','mtp','question_paper','suggested_answer','statutory_update','amendment'], 'standard', true, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.exam_attempts (id, level_id, attempt_key, label, status, verification_status, verification_method, source_id, source_url, content_hash, metadata)
select distinct 'attempt-' || l.code || '-' || m.attempt_key, l.id, m.attempt_key, trim(to_char(to_date(m.attempt_key || '-01', 'YYYY-MM-DD'), 'FMMonth YYYY')), 'scheduled', 'verified', 'phase3_verified_bootstrap', 'icai-examination-students', 'https://www.icai.org/category/examination-students', md5(l.code || ':' || m.attempt_key || ':phase3'), jsonb_build_object('bootstrap', 'phase3_attempt_syllabus_map') from public.attempt_syllabus_map m join public.course_levels l on l.id = m.level_id on conflict (level_id, attempt_key) do nothing;

create or replace function public.icai_sync_record_unchanged(p_run_id uuid, p_source_id text, p_snapshot jsonb) returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_snapshot_id uuid;
begin
insert into public.icai_source_snapshots (run_id, source_id, http_status, canonical_hash, content_length, etag, last_modified, parser_version, parsed_item_count, is_changed, metadata) values (p_run_id, p_source_id, coalesce((p_snapshot->>'http_status')::integer, 200), p_snapshot->>'canonical_hash', nullif(p_snapshot->>'content_length','')::integer, p_snapshot->>'etag', p_snapshot->>'last_modified', coalesce(p_snapshot->>'parser_version', 'phase8.1'), 0, false, coalesce(p_snapshot->'metadata','{}'::jsonb)) returning id into v_snapshot_id;
update public.icai_sources set last_attempt_at=now(),last_success_at=now(),last_error=null,last_error_at=null,consecutive_failures=0,last_content_hash=p_snapshot->>'canonical_hash',etag=coalesce(p_snapshot->>'etag',etag),last_modified=coalesce(p_snapshot->>'last_modified',last_modified),parser_version=coalesce(p_snapshot->>'parser_version',parser_version) where id=p_source_id;
update public.icai_sync_runs set source_processed=source_processed+1,source_succeeded=source_succeeded+1,unchanged_items=unchanged_items+1 where id=p_run_id;
return jsonb_build_object('snapshot_id',v_snapshot_id,'unchanged',true); end; $$;

create or replace function public.icai_sync_mark_source_failure(p_run_id uuid,p_source_id text,p_error text) returns void language plpgsql security invoker set search_path=public as $$ begin
update public.icai_sources set last_attempt_at=now(),last_error_at=now(),last_error=left(p_error,2000),consecutive_failures=consecutive_failures+1 where id=p_source_id;
update public.icai_sync_runs set source_processed=source_processed+1,source_failed=source_failed+1,error_summary=case when error_summary is null then left(p_source_id||': '||p_error,4000) else left(error_summary||E'\n'||p_source_id||': '||p_error,4000) end where id=p_run_id; end; $$;

create or replace function public.icai_sync_apply_source_batch(p_run_id uuid,p_source_id text,p_snapshot jsonb,p_resources jsonb default '[]'::jsonb,p_attempts jsonb default '[]'::jsonb,p_events jsonb default '[]'::jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_snapshot_id uuid; v_item jsonb; v_existing_resource public.icai_resources%rowtype; v_existing_attempt public.exam_attempts%rowtype; v_existing_event public.exam_events%rowtype; v_change_id bigint; v_attempt_id text; v_subject_id text; v_new integer:=0; v_changed integer:=0; v_unchanged integer:=0; v_removed integer:=0; v_pending integer:=0; v_date_changed boolean; v_seen_resource_ids text[]:='{}'::text[]; v_authoritative boolean:=coalesce((p_snapshot->'metadata'->>'authoritative_listing')::boolean,false);
begin
insert into public.icai_source_snapshots(run_id,source_id,http_status,canonical_hash,content_length,etag,last_modified,parser_version,parsed_item_count,is_changed,metadata) values(p_run_id,p_source_id,coalesce((p_snapshot->>'http_status')::integer,200),p_snapshot->>'canonical_hash',nullif(p_snapshot->>'content_length','')::integer,p_snapshot->>'etag',p_snapshot->>'last_modified',coalesce(p_snapshot->>'parser_version','phase8.1'),jsonb_array_length(coalesce(p_resources,'[]'::jsonb))+jsonb_array_length(coalesce(p_attempts,'[]'::jsonb))+jsonb_array_length(coalesce(p_events,'[]'::jsonb)),true,coalesce(p_snapshot->'metadata','{}'::jsonb)) returning id into v_snapshot_id;
for v_item in select value from jsonb_array_elements(coalesce(p_attempts,'[]'::jsonb)) loop select * into v_existing_attempt from public.exam_attempts where id=v_item->>'id'; if not found then insert into public.exam_attempts(id,level_id,attempt_key,label,start_date,end_date,status,verification_status,verification_method,source_id,source_url,source_snapshot_id,content_hash,metadata) values(v_item->>'id',v_item->>'level_id',v_item->>'attempt_key',v_item->>'label',nullif(v_item->>'start_date','')::date,nullif(v_item->>'end_date','')::date,coalesce(v_item->>'status','scheduled'),'verified','official_sync',p_source_id,v_item->>'source_url',v_snapshot_id,v_item->>'content_hash',coalesce(v_item->'metadata','{}'::jsonb)); insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,new_value,risk_level,decision_status,applied_at) values(p_run_id,p_source_id,'exam_attempt',v_item->>'id','created',v_item,'normal','auto_applied',now()); v_new:=v_new+1; elsif v_existing_attempt.content_hash=v_item->>'content_hash' then update public.exam_attempts set last_seen_at=now(),source_snapshot_id=v_snapshot_id where id=v_existing_attempt.id; v_unchanged:=v_unchanged+1; else v_date_changed:=v_existing_attempt.start_date is distinct from nullif(v_item->>'start_date','')::date or v_existing_attempt.end_date is distinct from nullif(v_item->>'end_date','')::date; if v_date_changed then insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,field_name,old_value,new_value,risk_level,decision_status) values(p_run_id,p_source_id,'exam_attempt',v_existing_attempt.id,'changed','dates',jsonb_build_object('start_date',v_existing_attempt.start_date,'end_date',v_existing_attempt.end_date),jsonb_build_object('start_date',nullif(v_item->>'start_date','')::date,'end_date',nullif(v_item->>'end_date','')::date),'high','pending_review') returning id into v_change_id; insert into public.icai_review_queue(change_event_id,run_id,source_id,entity_type,entity_id,title,reason,confidence,proposed_patch) values(v_change_id,p_run_id,p_source_id,'exam_attempt',v_existing_attempt.id,'Exam attempt date change: '||v_existing_attempt.label,'High-impact exam attempt dates changed on an official source. Canonical dates remain unchanged until review.',coalesce((v_item->>'confidence')::numeric,0.900),jsonb_build_object('start_date',nullif(v_item->>'start_date','')::date,'end_date',nullif(v_item->>'end_date','')::date,'label',v_item->>'label','status',coalesce(v_item->>'status','scheduled'),'source_url',v_item->>'source_url','source_snapshot_id',v_snapshot_id,'content_hash',v_item->>'content_hash','metadata',coalesce(v_item->'metadata','{}'::jsonb))); update public.exam_attempts set last_seen_at=now() where id=v_existing_attempt.id; v_changed:=v_changed+1; v_pending:=v_pending+1; else update public.exam_attempts set label=v_item->>'label',status=coalesce(v_item->>'status',status),verification_status='verified',verification_method='official_sync',source_id=p_source_id,source_url=v_item->>'source_url',source_snapshot_id=v_snapshot_id,content_hash=v_item->>'content_hash',metadata=coalesce(v_item->'metadata',metadata),last_seen_at=now(),last_changed_at=now() where id=v_existing_attempt.id; insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,old_value,new_value,risk_level,decision_status,applied_at) values(p_run_id,p_source_id,'exam_attempt',v_existing_attempt.id,'changed',jsonb_build_object('label',v_existing_attempt.label,'status',v_existing_attempt.status),jsonb_build_object('label',v_item->>'label','status',coalesce(v_item->>'status',v_existing_attempt.status)),'normal','auto_applied',now()); v_changed:=v_changed+1; end if; end if; end loop;
for v_item in select value from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop select * into v_existing_event from public.exam_events where id=v_item->>'id'; if not found then insert into public.exam_events(id,attempt_id,event_type,title,event_date,start_time,end_time,subject_id,verification_status,source_id,source_url,source_snapshot_id,content_hash,metadata) values(v_item->>'id',v_item->>'attempt_id',v_item->>'event_type',v_item->>'title',(v_item->>'event_date')::date,nullif(v_item->>'start_time','')::time,nullif(v_item->>'end_time','')::time,nullif(v_item->>'subject_id',''),'verified',p_source_id,v_item->>'source_url',v_snapshot_id,v_item->>'content_hash',coalesce(v_item->'metadata','{}'::jsonb)); insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,new_value,risk_level,decision_status,applied_at) values(p_run_id,p_source_id,'exam_event',v_item->>'id','created',v_item,'normal','auto_applied',now()); v_new:=v_new+1; elsif v_existing_event.content_hash=v_item->>'content_hash' then update public.exam_events set last_seen_at=now(),source_snapshot_id=v_snapshot_id where id=v_existing_event.id; v_unchanged:=v_unchanged+1; else v_date_changed:=v_existing_event.event_date is distinct from (v_item->>'event_date')::date or v_existing_event.start_time is distinct from nullif(v_item->>'start_time','')::time or v_existing_event.end_time is distinct from nullif(v_item->>'end_time','')::time; if v_date_changed then insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,field_name,old_value,new_value,risk_level,decision_status) values(p_run_id,p_source_id,'exam_event',v_existing_event.id,'changed','date_or_time',jsonb_build_object('event_date',v_existing_event.event_date,'start_time',v_existing_event.start_time,'end_time',v_existing_event.end_time),jsonb_build_object('event_date',(v_item->>'event_date')::date,'start_time',nullif(v_item->>'start_time','')::time,'end_time',nullif(v_item->>'end_time','')::time),'high','pending_review') returning id into v_change_id; insert into public.icai_review_queue(change_event_id,run_id,source_id,entity_type,entity_id,title,reason,confidence,proposed_patch) values(v_change_id,p_run_id,p_source_id,'exam_event',v_existing_event.id,'Exam event date/time change: '||v_existing_event.title,'High-impact exam date or time changed on an official source. Canonical date/time remains unchanged until review.',coalesce((v_item->>'confidence')::numeric,0.900),jsonb_build_object('event_date',(v_item->>'event_date')::date,'start_time',nullif(v_item->>'start_time','')::time,'end_time',nullif(v_item->>'end_time','')::time,'title',v_item->>'title','subject_id',nullif(v_item->>'subject_id',''),'source_url',v_item->>'source_url','source_snapshot_id',v_snapshot_id,'content_hash',v_item->>'content_hash','metadata',coalesce(v_item->'metadata','{}'::jsonb))); update public.exam_events set last_seen_at=now() where id=v_existing_event.id; v_changed:=v_changed+1; v_pending:=v_pending+1; else update public.exam_events set title=v_item->>'title',subject_id=nullif(v_item->>'subject_id',''),verification_status='verified',source_id=p_source_id,source_url=v_item->>'source_url',source_snapshot_id=v_snapshot_id,content_hash=v_item->>'content_hash',metadata=coalesce(v_item->'metadata',metadata),last_seen_at=now(),last_changed_at=now() where id=v_existing_event.id; insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,old_value,new_value,risk_level,decision_status,applied_at) values(p_run_id,p_source_id,'exam_event',v_existing_event.id,'changed',jsonb_build_object('title',v_existing_event.title,'subject_id',v_existing_event.subject_id),jsonb_build_object('title',v_item->>'title','subject_id',nullif(v_item->>'subject_id','')),'normal','auto_applied',now()); v_changed:=v_changed+1; end if; end if; end loop;
for v_item in select value from jsonb_array_elements(coalesce(p_resources,'[]'::jsonb)) loop v_seen_resource_ids:=array_append(v_seen_resource_ids,v_item->>'id'); select * into v_existing_resource from public.icai_resources where id=v_item->>'id'; if not found then insert into public.icai_resources(id,resource_type,title,summary,official_url,source_id,source_snapshot_id,published_on,status,verification_status,content_hash,parser_version,metadata) values(v_item->>'id',v_item->>'resource_type',v_item->>'title',nullif(v_item->>'summary',''),v_item->>'official_url',p_source_id,v_snapshot_id,nullif(v_item->>'published_on','')::date,'active','verified',v_item->>'content_hash',coalesce(v_item->>'parser_version','phase8.1'),coalesce(v_item->'metadata','{}'::jsonb)); insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,new_value,risk_level,decision_status,applied_at) values(p_run_id,p_source_id,'resource',v_item->>'id','created',v_item,'normal','auto_applied',now()); v_new:=v_new+1; elsif v_existing_resource.content_hash=v_item->>'content_hash' and v_existing_resource.status='active' then update public.icai_resources set last_seen_at=now(),source_snapshot_id=v_snapshot_id where id=v_existing_resource.id; v_unchanged:=v_unchanged+1; else update public.icai_resources set resource_type=v_item->>'resource_type',title=v_item->>'title',summary=nullif(v_item->>'summary',''),official_url=v_item->>'official_url',source_snapshot_id=v_snapshot_id,published_on=nullif(v_item->>'published_on','')::date,status='active',verification_status='verified',content_hash=v_item->>'content_hash',parser_version=coalesce(v_item->>'parser_version',parser_version),last_seen_at=now(),last_changed_at=now(),metadata=coalesce(v_item->'metadata',metadata) where id=v_existing_resource.id; insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,old_value,new_value,risk_level,decision_status,applied_at) values(p_run_id,p_source_id,'resource',v_existing_resource.id,'changed',jsonb_build_object('title',v_existing_resource.title,'official_url',v_existing_resource.official_url,'status',v_existing_resource.status),v_item,'normal','auto_applied',now()); v_changed:=v_changed+1; end if; delete from public.resource_attempt_map where resource_id=v_item->>'id'; for v_attempt_id in select jsonb_array_elements_text(coalesce(v_item->'attempt_ids','[]'::jsonb)) loop insert into public.resource_attempt_map(resource_id,attempt_id) values(v_item->>'id',v_attempt_id) on conflict do nothing; end loop; delete from public.resource_subject_map where resource_id=v_item->>'id'; for v_subject_id in select jsonb_array_elements_text(coalesce(v_item->'subject_ids','[]'::jsonb)) loop insert into public.resource_subject_map(resource_id,subject_id) values(v_item->>'id',v_subject_id) on conflict do nothing; end loop; end loop;
if v_authoritative then for v_existing_resource in select * from public.icai_resources where source_id=p_source_id and status='active' and not(id=any(v_seen_resource_ids)) loop update public.icai_resources set status='removed',last_changed_at=now() where id=v_existing_resource.id; insert into public.icai_change_events(run_id,source_id,entity_type,entity_id,change_type,old_value,new_value,risk_level,decision_status,applied_at) values(p_run_id,p_source_id,'resource',v_existing_resource.id,'removed',jsonb_build_object('status','active','official_url',v_existing_resource.official_url),jsonb_build_object('status','removed'),'normal','auto_applied',now()); v_removed:=v_removed+1; end loop; end if;
update public.icai_sources set last_attempt_at=now(),last_success_at=now(),last_error=null,last_error_at=null,consecutive_failures=0,last_content_hash=p_snapshot->>'canonical_hash',etag=coalesce(p_snapshot->>'etag',etag),last_modified=coalesce(p_snapshot->>'last_modified',last_modified),parser_version=coalesce(p_snapshot->>'parser_version',parser_version) where id=p_source_id;
update public.icai_sync_runs set source_processed=source_processed+1,source_succeeded=source_succeeded+1,new_items=new_items+v_new,changed_items=changed_items+v_changed,unchanged_items=unchanged_items+v_unchanged,removed_items=removed_items+v_removed,pending_reviews=pending_reviews+v_pending where id=p_run_id;
return jsonb_build_object('snapshot_id',v_snapshot_id,'new_items',v_new,'changed_items',v_changed,'unchanged_items',v_unchanged,'removed_items',v_removed,'pending_reviews',v_pending); end; $$;

create or replace function public.icai_review_decide(p_review_id uuid,p_decision text,p_reviewer uuid,p_notes text default null) returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_review public.icai_review_queue%rowtype; v_change public.icai_change_events%rowtype; begin if p_decision not in ('approved','rejected') then raise exception 'invalid review decision'; end if; select * into v_review from public.icai_review_queue where id=p_review_id for update; if not found then raise exception 'review not found'; end if; if v_review.status<>'pending' then raise exception 'review already decided'; end if; select * into v_change from public.icai_change_events where id=v_review.change_event_id; if p_decision='approved' then if v_review.entity_type='exam_event' then update public.exam_events set event_date=(v_review.proposed_patch->>'event_date')::date,start_time=nullif(v_review.proposed_patch->>'start_time','')::time,end_time=nullif(v_review.proposed_patch->>'end_time','')::time,title=coalesce(v_review.proposed_patch->>'title',title),subject_id=nullif(v_review.proposed_patch->>'subject_id',''),source_url=coalesce(v_review.proposed_patch->>'source_url',source_url),source_snapshot_id=nullif(v_review.proposed_patch->>'source_snapshot_id','')::uuid,content_hash=coalesce(v_review.proposed_patch->>'content_hash',content_hash),metadata=coalesce(v_review.proposed_patch->'metadata',metadata),verification_status='verified',last_seen_at=now(),last_changed_at=now() where id=v_review.entity_id; elsif v_review.entity_type='exam_attempt' then update public.exam_attempts set start_date=nullif(v_review.proposed_patch->>'start_date','')::date,end_date=nullif(v_review.proposed_patch->>'end_date','')::date,label=coalesce(v_review.proposed_patch->>'label',label),status=coalesce(v_review.proposed_patch->>'status',status),source_url=coalesce(v_review.proposed_patch->>'source_url',source_url),source_snapshot_id=nullif(v_review.proposed_patch->>'source_snapshot_id','')::uuid,content_hash=coalesce(v_review.proposed_patch->>'content_hash',content_hash),metadata=coalesce(v_review.proposed_patch->'metadata',metadata),verification_status='verified',verification_method='admin_review',last_seen_at=now(),last_changed_at=now() where id=v_review.entity_id; end if; end if; update public.icai_review_queue set status=p_decision,reviewed_by=p_reviewer,reviewed_at=now(),decision_notes=nullif(p_notes,'') where id=p_review_id; update public.icai_change_events set decision_status=p_decision,applied_at=case when p_decision='approved' then now() else applied_at end,reviewed_by=p_reviewer,review_notes=nullif(p_notes,'') where id=v_review.change_event_id; return jsonb_build_object('review_id',p_review_id,'decision',p_decision,'entity_type',v_review.entity_type,'entity_id',v_review.entity_id); end; $$;

revoke all on function public.icai_sync_record_unchanged(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.icai_sync_mark_source_failure(uuid,text,text) from public,anon,authenticated;
revoke all on function public.icai_sync_apply_source_batch(uuid,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.icai_review_decide(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.icai_sync_record_unchanged(uuid,text,jsonb) to service_role;
grant execute on function public.icai_sync_mark_source_failure(uuid,text,text) to service_role;
grant execute on function public.icai_sync_apply_source_batch(uuid,text,jsonb,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.icai_review_decide(uuid,text,uuid,text) to service_role;

insert into public.app_settings(key,value,is_public) values ('icai.sync','{"phase":8,"schedule":"30 0 * * *","timezone":"UTC","local_time":"06:00 IST","verification":"official_source_monitoring","parser_version":"phase8.1"}'::jsonb,true),('app.phase','{"phase":8,"status":"icai_daily_update_engine"}'::jsonb,true) on conflict(key) do update set value=excluded.value,is_public=excluded.is_public,updated_at=now();