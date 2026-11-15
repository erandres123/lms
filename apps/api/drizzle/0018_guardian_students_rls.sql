-- Tenant isolation for guardian-to-student links.

alter table "guardian_students" enable row level security;

drop policy if exists guardian_students_tenant_select on "guardian_students";
create policy guardian_students_tenant_select on "guardian_students"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists guardian_students_tenant_insert on "guardian_students";
create policy guardian_students_tenant_insert on "guardian_students"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists guardian_students_tenant_update on "guardian_students";
create policy guardian_students_tenant_update on "guardian_students"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists guardian_students_tenant_delete on "guardian_students";
create policy guardian_students_tenant_delete on "guardian_students"
  for delete using (tenant_id = public.current_tenant_id());
