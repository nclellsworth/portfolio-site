-- Run once in an existing portal database before publishing the lesson controls.
-- Existing lessons remain visible to students until an instructor hides them.
begin;

alter table public.lessons
  add column visible_to_student boolean not null default true;

drop policy "view linked lessons" on public.lessons;
create policy "view visible linked lessons or instructor lessons"
on public.lessons for select to authenticated
using (
  (select public.is_instructor())
  or (visible_to_student and public.can_view_student(student_id))
);

commit;
