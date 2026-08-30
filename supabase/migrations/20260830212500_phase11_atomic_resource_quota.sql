-- Final quota enforcement and metadata creation happen in one DB transaction so
-- concurrent uploads cannot both pass a stale pre-check.
create or replace function public.phase11_create_uploaded_resource(
 p_user_id uuid,p_title text,p_description text,p_subject_id text,p_chapter_id text,p_original_filename text,p_safe_filename text,p_storage_path text,p_mime_type text,p_extension text,p_size_bytes bigint,p_visibility text
) returns table(id uuid, moderation_status text, used_bytes bigint, limit_bytes bigint)
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_ent record; v_used bigint; v_limit bigint; v_id uuid;
begin
 if p_user_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,11));
 select * into v_ent from public.phase11_effective_entitlement(p_user_id,'resources.storage');
 if not found or not v_ent.allowed then raise exception 'Storage entitlement required.' using errcode='42501'; end if;
 select coalesce(sum(r.size_bytes),0)::bigint into v_used from public.uploaded_resources r where r.owner_user_id=p_user_id;
 v_limit=case when v_ent.limit_unit='megabytes' and v_ent.limit_value is not null then floor(v_ent.limit_value*1024*1024)::bigint else null end;
 if v_limit is not null and v_used+p_size_bytes>v_limit then raise exception 'Storage allowance exceeded.' using errcode='P0001'; end if;
 if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>10485760 then raise exception 'Resource file size is invalid.' using errcode='22023'; end if;
 if p_storage_path is null or position(p_user_id::text || '/' in p_storage_path)<>1 then raise exception 'Resource storage path is invalid.' using errcode='42501'; end if;
 if p_visibility not in ('private','shared') then raise exception 'Unknown resource visibility.' using errcode='22023'; end if;
 if p_extension not in ('pdf','jpg','jpeg','png','webp','doc','docx') then raise exception 'Resource extension is not allowed.' using errcode='22023'; end if;
 insert into public.uploaded_resources(owner_user_id,title,description,subject_id,chapter_id,original_filename,safe_filename,storage_bucket,storage_path,mime_type,extension,size_bytes,visibility)
 values(p_user_id,trim(p_title),nullif(trim(coalesce(p_description,'')),''),p_subject_id,p_chapter_id,p_original_filename,p_safe_filename,'r2:ca-progress-v2-staging-user-resources',p_storage_path,p_mime_type,p_extension,p_size_bytes,p_visibility)
 returning uploaded_resources.id into v_id;
 return query select r.id,r.moderation_status,v_used+p_size_bytes,v_limit from public.uploaded_resources r where r.id=v_id;
end; $$;
revoke all on function public.phase11_create_uploaded_resource(uuid,text,text,text,text,text,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.phase11_create_uploaded_resource(uuid,text,text,text,text,text,text,text,text,text,bigint,text) to service_role;
