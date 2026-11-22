create table if not exists public.gp_analysis_posts(id bigint generated always as identity primary key,access_level text not null check(access_level in ('free','vip')),template text not null check(template in ('basic','quick','image','detailed')),title text not null, sport text not null default '',home_team text not null default '',away_team text not null default '',match_at timestamptz,prediction text not null default '',body text not null default '',image_urls jsonb not null default '[]'::jsonb,result text not null default 'pending' check(result in ('pending','hit','miss','void')),status text not null default 'draft' check(status in ('draft','published')),publish_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.gp_analysis_posts enable row level security;
revoke all on public.gp_analysis_posts from public,anon,authenticated;
grant select on public.gp_analysis_posts to anon,authenticated;
drop policy if exists gp_analysis_read on public.gp_analysis_posts;
create policy gp_analysis_read on public.gp_analysis_posts for select to anon,authenticated using(status='published' and publish_at<=now() and (access_level='free' or (access_level='vip' and exists(select 1 from public.vip_memberships m where m.user_id=auth.uid() and m.starts_at<=now() and m.expires_at>now()))));
create or replace function public.gp_analysis_admin_list() returns jsonb language plpgsql security definer set search_path='' as $$ begin
if not exists(select 1 from public.goldpick_admins where user_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501';end if;
return (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) from (select * from public.gp_analysis_posts order by created_at desc limit 100)p);
end;$$;
create or replace function public.gp_analysis_admin_save(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id bigint;v_post public.gp_analysis_posts%rowtype;
begin
if not exists(select 1 from public.goldpick_admins where user_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501';end if;
if length(coalesce(p_data->>'title','')) not between 1 and 160 or coalesce(p_data->>'access_level','') not in ('free','vip') or coalesce(p_data->>'template','') not in ('basic','quick','image','detailed') or coalesce(p_data->>'result','') not in ('pending','hit','miss','void') or coalesce(p_data->>'status','') not in ('draft','published') then raise exception 'Invalid fields';end if;
if jsonb_typeof(coalesce(p_data->'image_urls','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_data->'image_urls','[]'::jsonb))>8 then raise exception 'Invalid images';end if;
v_id:=nullif(p_data->>'id','')::bigint;
if v_id is not null then
update public.gp_analysis_posts set access_level=p_data->>'access_level',template=p_data->>'template',title=p_data->>'title',sport=left(coalesce(p_data->>'sport',''),80),home_team=left(coalesce(p_data->>'home_team',''),100),away_team=left(coalesce(p_data->>'away_team',''),100),match_at=nullif(p_data->>'match_at','')::timestamptz,prediction=left(coalesce(p_data->>'prediction',''),300),body=left(coalesce(p_data->>'body',''),20000),image_urls=p_data->'image_urls',result=p_data->>'result',status=p_data->>'status',publish_at=coalesce(nullif(p_data->>'publish_at','')::timestamptz,now()),updated_at=now() where id=v_id returning * into v_post;
else
insert into public.gp_analysis_posts(access_level,template,title,sport,home_team,away_team,match_at,prediction,body,image_urls,result,status,publish_at) values(p_data->>'access_level',p_data->>'template',p_data->>'title',left(coalesce(p_data->>'sport',''),80),left(coalesce(p_data->>'home_team',''),100),left(coalesce(p_data->>'away_team',''),100),nullif(p_data->>'match_at','')::timestamptz,left(coalesce(p_data->>'prediction',''),300),left(coalesce(p_data->>'body',''),20000),p_data->'image_urls',p_data->>'result',p_data->>'status',coalesce(nullif(p_data->>'publish_at','')::timestamptz,now())) returning * into v_post;
end if;
if v_post.id is null then raise exception 'Not found';end if;
return jsonb_build_object('ok',true,'id',v_post.id);
end;$$;
create or replace function public.gp_analysis_admin_delete(p_id bigint) returns boolean language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.goldpick_admins where user_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501';end if;
delete from public.gp_analysis_posts where id=p_id;return found;end;$$;
revoke all on function public.gp_analysis_admin_list() from public,anon,authenticated;
revoke all on function public.gp_analysis_admin_save(jsonb) from public,anon,authenticated;
revoke all on function public.gp_analysis_admin_delete(bigint) from public,anon,authenticated;
grant execute on function public.gp_analysis_admin_list(),public.gp_analysis_admin_save(jsonb),public.gp_analysis_admin_delete(bigint) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('gp-analysis','gp-analysis',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']) on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create policy gp_analysis_image_read on storage.objects for select to anon,authenticated using(bucket_id='gp-analysis');
create policy gp_analysis_image_upload on storage.objects for insert to authenticated with check(bucket_id='gp-analysis' and exists(select 1 from public.goldpick_admins where user_id=auth.uid()));
