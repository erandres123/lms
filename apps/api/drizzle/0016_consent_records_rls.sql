-- Tenant isolation for guardian consent history.

alter table "consent_records" enable row level security;

drop policy if exists consent_records_tenant_select on "consent_records";
create policy consent_records_tenant_select on "consent_records"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists consent_records_tenant_insert on "consent_records";
create policy consent_records_tenant_insert on "consent_records"
  for insert with check (tenant_id = public.current_tenant_id());
