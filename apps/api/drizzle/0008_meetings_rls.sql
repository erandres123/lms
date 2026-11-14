-- Tenant isolation for live class tables.

alter table "meetings" enable row level security;
alter table "meeting_participants" enable row level security;
alter table "meeting_events" enable row level security;

drop policy if exists meetings_tenant_select on "meetings";
create policy meetings_tenant_select on "meetings"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists meetings_tenant_insert on "meetings";
create policy meetings_tenant_insert on "meetings"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists meetings_tenant_update on "meetings";
create policy meetings_tenant_update on "meetings"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists meetings_tenant_delete on "meetings";
create policy meetings_tenant_delete on "meetings"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists meeting_participants_tenant_select on "meeting_participants";
create policy meeting_participants_tenant_select on "meeting_participants"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists meeting_participants_tenant_insert on "meeting_participants";
create policy meeting_participants_tenant_insert on "meeting_participants"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists meeting_participants_tenant_update on "meeting_participants";
create policy meeting_participants_tenant_update on "meeting_participants"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists meeting_participants_tenant_delete on "meeting_participants";
create policy meeting_participants_tenant_delete on "meeting_participants"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists meeting_events_tenant_select on "meeting_events";
create policy meeting_events_tenant_select on "meeting_events"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists meeting_events_tenant_insert on "meeting_events";
create policy meeting_events_tenant_insert on "meeting_events"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists meeting_events_tenant_update on "meeting_events";
create policy meeting_events_tenant_update on "meeting_events"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists meeting_events_tenant_delete on "meeting_events";
create policy meeting_events_tenant_delete on "meeting_events"
  for delete using (tenant_id = public.current_tenant_id());
