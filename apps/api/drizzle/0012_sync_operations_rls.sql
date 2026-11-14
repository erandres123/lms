-- Tenant isolation for offline operation receipts.

alter table "sync_operations" enable row level security;

drop policy if exists sync_operations_tenant_select on "sync_operations";
create policy sync_operations_tenant_select on "sync_operations"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists sync_operations_tenant_insert on "sync_operations";
create policy sync_operations_tenant_insert on "sync_operations"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists sync_operations_tenant_update on "sync_operations";
create policy sync_operations_tenant_update on "sync_operations"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
