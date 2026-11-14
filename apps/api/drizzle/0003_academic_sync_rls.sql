-- Server-side version bump and append-only change log for device sync.
-- Clients pull by (tenant_id, seq); change_log rows are never updated.

create or replace function public.bump_row_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.log_row_change()
returns trigger
language plpgsql
as $$
declare
  v_tenant uuid;
  v_row text;
  v_op text;
  v_version integer;
begin
  if tg_op = 'DELETE' then
    v_tenant := old.tenant_id;
    v_row := old.id::text;
    v_op := 'delete';
    v_version := old.version;
  else
    v_tenant := new.tenant_id;
    v_row := new.id::text;
    v_op := lower(tg_op);
    v_version := new.version;
  end if;

  insert into change_log (tenant_id, table_name, row_id, operation, row_version)
  values (v_tenant, tg_table_name, v_row, v_op, v_version);

  return null;
end;
$$;

drop trigger if exists students_bump_version on "students";
create trigger students_bump_version
  before update on "students"
  for each row execute function public.bump_row_version();

drop trigger if exists students_log_change on "students";
create trigger students_log_change
  after insert or update or delete on "students"
  for each row execute function public.log_row_change();

drop trigger if exists sections_bump_version on "sections";
create trigger sections_bump_version
  before update on "sections"
  for each row execute function public.bump_row_version();

drop trigger if exists sections_log_change on "sections";
create trigger sections_log_change
  after insert or update or delete on "sections"
  for each row execute function public.log_row_change();

drop trigger if exists enrollments_bump_version on "enrollments";
create trigger enrollments_bump_version
  before update on "enrollments"
  for each row execute function public.bump_row_version();

drop trigger if exists enrollments_log_change on "enrollments";
create trigger enrollments_log_change
  after insert or update or delete on "enrollments"
  for each row execute function public.log_row_change();

drop trigger if exists attendance_bump_version on "attendance";
create trigger attendance_bump_version
  before update on "attendance"
  for each row execute function public.bump_row_version();

drop trigger if exists attendance_log_change on "attendance";
create trigger attendance_log_change
  after insert or update or delete on "attendance"
  for each row execute function public.log_row_change();

alter table "students" enable row level security;
alter table "sections" enable row level security;
alter table "enrollments" enable row level security;
alter table "attendance" enable row level security;

drop policy if exists students_tenant_select on "students";
create policy students_tenant_select on "students"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists students_tenant_insert on "students";
create policy students_tenant_insert on "students"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists students_tenant_update on "students";
create policy students_tenant_update on "students"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists students_tenant_delete on "students";
create policy students_tenant_delete on "students"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists sections_tenant_select on "sections";
create policy sections_tenant_select on "sections"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists sections_tenant_insert on "sections";
create policy sections_tenant_insert on "sections"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists sections_tenant_update on "sections";
create policy sections_tenant_update on "sections"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists sections_tenant_delete on "sections";
create policy sections_tenant_delete on "sections"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists enrollments_tenant_select on "enrollments";
create policy enrollments_tenant_select on "enrollments"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists enrollments_tenant_insert on "enrollments";
create policy enrollments_tenant_insert on "enrollments"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists enrollments_tenant_update on "enrollments";
create policy enrollments_tenant_update on "enrollments"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists enrollments_tenant_delete on "enrollments";
create policy enrollments_tenant_delete on "enrollments"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists attendance_tenant_select on "attendance";
create policy attendance_tenant_select on "attendance"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists attendance_tenant_insert on "attendance";
create policy attendance_tenant_insert on "attendance"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists attendance_tenant_update on "attendance";
create policy attendance_tenant_update on "attendance"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists attendance_tenant_delete on "attendance";
create policy attendance_tenant_delete on "attendance"
  for delete using (tenant_id = public.current_tenant_id());
