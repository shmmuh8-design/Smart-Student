-- الطالب الذكي: عدّاد الدروس اليومية لكل جهاز (بدون أي بيانات شخصية)
-- انسخ الملف كامل والصقه في Supabase → SQL Editor واضغط Run

create table if not exists public.ss_usage (
  device text not null,
  day date not null default (now() at time zone 'Asia/Muscat')::date,
  n int not null default 0,
  primary key (device, day)
);
alter table public.ss_usage enable row level security;   -- محد يقدر يقرأه من التطبيق

-- تزيد العدّاد وترجع العدد الجديد، أو -1 إذا وصل الحد اليومي
create or replace function public.ss_bump(p_device text, p_limit int)
returns int language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Muscat')::date; v int;
begin
  insert into ss_usage(device, day, n) values (p_device, d, 0) on conflict do nothing;
  select n into v from ss_usage where device = p_device and day = d for update;
  if v >= p_limit then return -1; end if;
  update ss_usage set n = n + 1 where device = p_device and day = d returning n into v;
  return v;
end $$;
revoke all on function public.ss_bump(text, int) from public, anon, authenticated;

-- تنظيف: حذف العدادات الأقدم من أسبوع (اختياري، تقدر تشغله أي وقت)
-- delete from public.ss_usage where day < (now() at time zone 'Asia/Muscat')::date - 7;

-- ترجيع المحاولة إذا فشل الذكاء الاصطناعي (عشان ما تنحسب على الطالب)
create or replace function public.ss_unbump(p_device text)
returns void language sql security definer set search_path = public as $$
  update ss_usage set n = greatest(0, n - 1) where device = p_device and day = (now() at time zone 'Asia/Muscat')::date;
$$;
revoke all on function public.ss_unbump(text) from public, anon, authenticated;
