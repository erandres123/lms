-- Tenant isolation is defense-in-depth: NestJS is the only write path and sets
-- app.tenant_id inside the transaction before touching tenant data.
-- These policies apply only when the runtime role is neither the table owner
-- nor BYPASSRLS. Enable `force row level security` when the dedicated app role
-- split lands with the deployment work.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

alter table "tenants" enable row level security;
alter table "users" enable row level security;
alter table "user_tenants" enable row level security;
alter table "audit_log" enable row level security;
alter table "change_log" enable row level security;

drop policy if exists tenants_select on "tenants";
create policy tenants_select on "tenants"
  for select using (id = public.current_tenant_id());

drop policy if exists tenants_insert on "tenants";
create policy tenants_insert on "tenants"
  for insert with check (id = public.current_tenant_id());

drop policy if exists tenants_update on "tenants";
create policy tenants_update on "tenants"
  for update using (id = public.current_tenant_id())
  with check (id = public.current_tenant_id());

drop policy if exists user_tenants_select on "user_tenants";
create policy user_tenants_select on "user_tenants"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists user_tenants_insert on "user_tenants";
create policy user_tenants_insert on "user_tenants"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists user_tenants_update on "user_tenants";
create policy user_tenants_update on "user_tenants"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists user_tenants_delete on "user_tenants";
create policy user_tenants_delete on "user_tenants"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists users_select on "users";
create policy users_select on "users"
  for select using (
    exists (
      select 1
      from "user_tenants" ut
      where ut.user_id = "users".id
        and ut.tenant_id = public.current_tenant_id()
    )
  );

drop policy if exists users_update on "users";
create policy users_update on "users"
  for update using (
    exists (
      select 1
      from "user_tenants" ut
      where ut.user_id = "users".id
        and ut.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    exists (
      select 1
      from "user_tenants" ut
      where ut.user_id = "users".id
        and ut.tenant_id = public.current_tenant_id()
    )
  );

drop policy if exists audit_log_select on "audit_log";
create policy audit_log_select on "audit_log"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists audit_log_insert on "audit_log";
create policy audit_log_insert on "audit_log"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists change_log_select on "change_log";
create policy change_log_select on "change_log"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists change_log_insert on "change_log";
create policy change_log_insert on "change_log"
  for insert with check (tenant_id = public.current_tenant_id());
