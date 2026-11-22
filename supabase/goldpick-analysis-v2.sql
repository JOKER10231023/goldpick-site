-- Gold Pick 분석 V2: 사진 업로드 권한, VIP 사진 보호, 적중률 실시간 집계
-- 기존 SQL을 삭제하지 않고 Supabase SQL Editor에서 이 파일 전체를 1회 실행하세요.
create or replace function public.gp_has_active_vip()
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.vip_memberships m
    where m.user_id=(select auth.uid()) and m.starts_at<=now() and m.expires_at>now()
  );
$$;
revoke all on function public.gp_has_active_vip() from public,anon,authenticated;
grant execute on function public.gp_has_active_vip() to anon,authenticated;

-- VIP 데이터 권한은 테이블 외부 의존성 대신 SECURITY DEFINER 검사 함수로 판정합니다.
drop policy if exists gp_analysis_read on public.gp_analysis_posts;
create policy gp_analysis_read on public.gp_analysis_posts
for select to anon,authenticated using (
  status='published' and publish_at<=now()
  and (access_level='free' or
       (access_level='vip' and (select public.gp_has_active_vip())))
);

-- 실제 공개된 분석의 확정된 결과만 계산합니다. 대기/적특/임시저장은 분모에서 제외합니다.
create or replace function public.gp_public_accuracy()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'hit',count(*) filter(where result='hit'),
    'miss',count(*) filter(where result='miss'),
    'pending',count(*) filter(where result='pending'),
    'void',count(*) filter(where result='void')
  ) from public.gp_analysis_posts
  where status='published' and publish_at<=now();
$$;
revoke all on function public.gp_public_accuracy() from public,anon,authenticated;
grant execute on function public.gp_public_accuracy() to anon,authenticated;

-- 관리자인지 확인하는 기존 goldpick_is_admin()은 보안 정의자로 실행되어
-- goldpick_admins에 직접 SELECT 권한이 없어도 사진 업로드를 허용합니다.
drop policy if exists gp_analysis_image_upload on storage.objects;
create policy gp_analysis_image_upload on storage.objects for insert to authenticated
with check (bucket_id='gp-analysis' and (select public.goldpick_is_admin()));

drop policy if exists gp_analysis_image_delete on storage.objects;
create policy gp_analysis_image_delete on storage.objects for delete to authenticated
using (bucket_id='gp-analysis' and (select public.goldpick_is_admin()));

-- 무료 이미지는 공개, VIP 이미지는 비공개 버킷에 저장합니다.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('gp-vip-analysis','gp-vip-analysis',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists gp_vip_analysis_image_read on storage.objects;
create policy gp_vip_analysis_image_read on storage.objects for select to authenticated
using (bucket_id='gp-vip-analysis' and (
  (select public.gp_has_active_vip()) or (select public.goldpick_is_admin())
));

drop policy if exists gp_vip_analysis_image_upload on storage.objects;
create policy gp_vip_analysis_image_upload on storage.objects for insert to authenticated
with check (bucket_id='gp-vip-analysis' and (select public.goldpick_is_admin()));

drop policy if exists gp_vip_analysis_image_delete on storage.objects;
create policy gp_vip_analysis_image_delete on storage.objects for delete to authenticated
using (bucket_id='gp-vip-analysis' and (select public.goldpick_is_admin()));

-- 무료 게시물에 넣었던 기존 공개 이미지 URL은 자동으로 비공개로 전환되지 않습니다.
-- 공개 범위를 VIP로 바꿀 때는 관리자 화면에서 이미지를 다시 업로드하세요.
