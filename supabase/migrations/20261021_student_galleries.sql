-- Run once against an EXISTING portal database, before publishing the new pages.
-- For a new database, run schema.sql first, then this migration.
begin;

create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (id, student_id)
);
create unique index project_folders_student_name on public.project_folders(student_id, lower(trim(name)));
alter table public.project_folders enable row level security;
revoke all on public.project_folders from anon;
grant select, insert, update, delete on public.project_folders to authenticated;
create policy "manage linked folders" on public.project_folders for all to authenticated
using (public.can_view_student(student_id)) with check (public.can_view_student(student_id));

alter table public.artworks
  add column category text not null default 'art' check (category in ('art','inspo')),
  add column folder_id uuid,
  add constraint artwork_folder_same_student foreign key (folder_id, student_id)
    references public.project_folders(id, student_id) on delete set null (folder_id),
  add constraint inspo_has_no_project_folder check (category = 'art' or folder_id is null);
create index artworks_folder_idx on public.artworks(folder_id, student_id);

-- A client may organize images, but cannot reassign their files or student owner.
create function public.keep_gallery_ownership() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.student_id is distinct from old.student_id then
    raise exception 'Student ownership cannot be changed';
  end if;
  if tg_table_name = 'artworks' then
    if new.storage_path is distinct from old.storage_path or new.category is distinct from old.category then
      raise exception 'Image path and category cannot be changed';
    end if;
  end if;
  return new;
end;
$$;
create trigger keep_artwork_ownership before update on public.artworks
for each row execute function public.keep_gallery_ownership();
create trigger keep_folder_ownership before update on public.project_folders
for each row execute function public.keep_gallery_ownership();

drop policy "instructor adds artwork" on public.artworks;
drop policy "instructor updates artwork" on public.artworks;
drop policy "instructor deletes artwork" on public.artworks;
create policy "add linked artwork" on public.artworks for insert to authenticated
with check (public.can_view_student(student_id));
create policy "update linked artwork" on public.artworks for update to authenticated
using (public.can_view_student(student_id)) with check (public.can_view_student(student_id));
create policy "delete linked artwork" on public.artworks for delete to authenticated
using (public.can_view_student(student_id));

drop policy "instructor can upload art files" on storage.objects;
drop policy "instructor can delete art files" on storage.objects;
create policy "linked account can upload art files" on storage.objects for insert to authenticated
with check (bucket_id='student-art' and public.can_view_student(
  case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then split_part(name,'/',1)::uuid else null end));
create policy "linked account can delete art files" on storage.objects for delete to authenticated
using (bucket_id='student-art' and public.can_view_student(
  case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then split_part(name,'/',1)::uuid else null end));
commit;
