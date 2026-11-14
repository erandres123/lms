-- Tenant isolation for notifications and push device tokens.

alter table "notifications" enable row level security;
alter table "push_devices" enable row level security;

drop policy if exists notifications_tenant_select on "notifications";
create policy notifications_tenant_select on "notifications"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists notifications_tenant_insert on "notifications";
create policy notifications_tenant_insert on "notifications"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists notifications_tenant_update on "notifications";
create policy notifications_tenant_update on "notifications"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists notifications_tenant_delete on "notifications";
create policy notifications_tenant_delete on "notifications"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists push_devices_tenant_select on "push_devices";
create policy push_devices_tenant_select on "push_devices"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists push_devices_tenant_insert on "push_devices";
create policy push_devices_tenant_insert on "push_devices"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists push_devices_tenant_update on "push_devices";
create policy push_devices_tenant_update on "push_devices"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists push_devices_tenant_delete on "push_devices";
create policy push_devices_tenant_delete on "push_devices"
  for delete using (tenant_id = public.current_tenant_id());
