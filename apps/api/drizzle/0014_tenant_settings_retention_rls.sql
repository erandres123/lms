-- Tenant isolation for versioned settings and the retention run ledger.

alter table "tenant_settings" enable row level security;

drop policy if exists tenant_settings_tenant_select on "tenant_settings";
create policy tenant_settings_tenant_select on "tenant_settings"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists tenant_settings_tenant_insert on "tenant_settings";
create policy tenant_settings_tenant_insert on "tenant_settings"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists tenant_settings_tenant_update on "tenant_settings";
create policy tenant_settings_tenant_update on "tenant_settings"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

alter table "retention_runs" enable row level security;

drop policy if exists retention_runs_tenant_select on "retention_runs";
create policy retention_runs_tenant_select on "retention_runs"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists retention_runs_tenant_insert on "retention_runs";
create policy retention_runs_tenant_insert on "retention_runs"
  for insert with check (tenant_id = public.current_tenant_id());
