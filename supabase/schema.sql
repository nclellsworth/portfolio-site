-- Run once in a NEW Supabase project via SQL Editor.
-- Parent-controlled accounts. Every access to a student's data is backed by RLS.
-- Instructor privilege is established ONLY manually in SQL, not from the browser.
create extension if not exists pgcrypto;

create table public.instructors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  account_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(char_length(trim(display_name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index students_account_idx on public.students(account_user_id);

create table public.dream_projects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 160),
  notes text not null default '' check(char_length(notes)<=1000),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index dreams_student_idx on public.dream_projects(student_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
  summary text not null default '' check(char_length(summary)<=2000),
  created_at timestamptz not null default now(),
  constraint lesson_time_valid check(ends_at>starts_at)
);
create index lessons_student_idx on public.lessons(student_id);

create table public.artworks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 160),
  notes text not null default '' check(char_length(notes)<=1500),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint artwork_path_matches_student check(split_part(storage_path,'/',1)=student_id::text)
);
create index artworks_student_idx on public.artworks(student_id);

-- Separate privileges from normal user-editable student records.
create or replace function public.is_instructor()
returns boolean language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.instructors where user_id=(select auth.uid())); $$;

create or replace function public.can_view_student(sid uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$ select public.is_instructor() or exists (
  select 1 from public.students s where s.id=sid and s.account_user_id=(select auth.uid())
); $$;

revoke all on function public.is_instructor() from public, anon;
revoke all on function public.can_view_student(uuid) from public, anon;
grant execute on function public.is_instructor() to authenticated;
grant execute on function public.can_view_student(uuid) to authenticated;

alter table public.instructors enable row level security;
alter table public.students enable row level security;
alter table public.dream_projects enable row level security;
alter table public.lessons enable row level security;
alter table public.artworks enable row level security;

revoke all on public.instructors, public.students, public.dream_projects, public.lessons, public.artworks from anon;
grant usage on schema public to authenticated;
grant select on public.instructors, public.students, public.dream_projects, public.lessons, public.artworks to authenticated;
grant insert, update, delete on public.students,public.dream_projects,public.lessons,public.artworks to authenticated;

create policy "instructor sees own privilege" on public.instructors for select to authenticated
using (user_id=(select auth.uid()));
-- No client grants or policies for adding/editing instructors.

create policy "view linked students" on public.students for select to authenticated
using (account_user_id=(select auth.uid()) or (select public.is_instructor()));
create policy "instructor creates students" on public.students for insert to authenticated
with check ((select public.is_instructor()));
create policy "instructor edits students" on public.students for update to authenticated
using ((select public.is_instructor())) with check ((select public.is_instructor()));
create policy "instructor deletes students" on public.students for delete to authenticated
using ((select public.is_instructor()));

create policy "view own dreams" on public.dream_projects for select to authenticated
using (public.can_view_student(student_id));
create policy "add own dreams" on public.dream_projects for insert to authenticated
with check (public.can_view_student(student_id));
create policy "edit own dreams" on public.dream_projects for update to authenticated
using (public.can_view_student(student_id)) with check (public.can_view_student(student_id));
create policy "remove own dreams" on public.dream_projects for delete to authenticated
using (public.can_view_student(student_id));

create policy "view linked lessons" on public.lessons for select to authenticated
using (public.can_view_student(student_id));
create policy "instructor adds lessons" on public.lessons for insert to authenticated
with check ((select public.is_instructor()));
create policy "instructor updates lessons" on public.lessons for update to authenticated
using ((select public.is_instructor())) with check ((select public.is_instructor()));
create policy "instructor deletes lessons" on public.lessons for delete to authenticated
using ((select public.is_instructor()));

create policy "view linked artwork" on public.artworks for select to authenticated
using (public.can_view_student(student_id));
create policy "instructor adds artwork" on public.artworks for insert to authenticated
with check ((select public.is_instructor()));
create policy "instructor updates artwork" on public.artworks for update to authenticated
using ((select public.is_instructor())) with check ((select public.is_instructor()));
create policy "instructor deletes artwork" on public.artworks for delete to authenticated
using ((select public.is_instructor()));

-- Private storage bucket. File paths must begin with student UUID:
-- student-uuid/random-uuid.jpg
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('student-art','student-art',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "linked account can read art files" on storage.objects
for select to authenticated
using (bucket_id='student-art' and public.can_view_student((case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end)));
create policy "instructor can upload art files" on storage.objects
for insert to authenticated
with check (bucket_id='student-art' and (select public.is_instructor())
  and public.can_view_student((case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end)));
create policy "instructor can delete art files" on storage.objects
for delete to authenticated
using (bucket_id='student-art' and (select public.is_instructor()));

-- IMPORTANT: In Supabase Authentication > Users, create your own Auth user,
-- then insert ONLY your UUID below in SQL Editor (not the website):
-- insert into public.instructors(user_id) values ('YOUR-AUTH-USER-UUID');
