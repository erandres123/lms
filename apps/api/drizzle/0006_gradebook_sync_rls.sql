-- Sync triggers and tenant isolation for gradebook tables.

drop trigger if exists grading_periods_bump_version on "grading_periods";
create trigger grading_periods_bump_version
  before update on "grading_periods"
  for each row execute function public.bump_row_version();

drop trigger if exists grading_periods_log_change on "grading_periods";
create trigger grading_periods_log_change
  after insert or update or delete on "grading_periods"
  for each row execute function public.log_row_change();

drop trigger if exists grade_categories_bump_version on "grade_categories";
create trigger grade_categories_bump_version
  before update on "grade_categories"
  for each row execute function public.bump_row_version();

drop trigger if exists grade_categories_log_change on "grade_categories";
create trigger grade_categories_log_change
  after insert or update or delete on "grade_categories"
  for each row execute function public.log_row_change();

drop trigger if exists grade_items_bump_version on "grade_items";
create trigger grade_items_bump_version
  before update on "grade_items"
  for each row execute function public.bump_row_version();

drop trigger if exists grade_items_log_change on "grade_items";
create trigger grade_items_log_change
  after insert or update or delete on "grade_items"
  for each row execute function public.log_row_change();

drop trigger if exists grades_bump_version on "grades";
create trigger grades_bump_version
  before update on "grades"
  for each row execute function public.bump_row_version();

drop trigger if exists grades_log_change on "grades";
create trigger grades_log_change
  after insert or update or delete on "grades"
  for each row execute function public.log_row_change();

drop trigger if exists grade_overrides_bump_version on "grade_overrides";
create trigger grade_overrides_bump_version
  before update on "grade_overrides"
  for each row execute function public.bump_row_version();

drop trigger if exists grade_overrides_log_change on "grade_overrides";
create trigger grade_overrides_log_change
  after insert or update or delete on "grade_overrides"
  for each row execute function public.log_row_change();

alter table "grading_periods" enable row level security;
alter table "grade_categories" enable row level security;
alter table "grade_items" enable row level security;
alter table "grades" enable row level security;
alter table "grade_overrides" enable row level security;

drop policy if exists grading_periods_tenant_select on "grading_periods";
create policy grading_periods_tenant_select on "grading_periods"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists grading_periods_tenant_insert on "grading_periods";
create policy grading_periods_tenant_insert on "grading_periods"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists grading_periods_tenant_update on "grading_periods";
create policy grading_periods_tenant_update on "grading_periods"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists grading_periods_tenant_delete on "grading_periods";
create policy grading_periods_tenant_delete on "grading_periods"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists grade_categories_tenant_select on "grade_categories";
create policy grade_categories_tenant_select on "grade_categories"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists grade_categories_tenant_insert on "grade_categories";
create policy grade_categories_tenant_insert on "grade_categories"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists grade_categories_tenant_update on "grade_categories";
create policy grade_categories_tenant_update on "grade_categories"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists grade_categories_tenant_delete on "grade_categories";
create policy grade_categories_tenant_delete on "grade_categories"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists grade_items_tenant_select on "grade_items";
create policy grade_items_tenant_select on "grade_items"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists grade_items_tenant_insert on "grade_items";
create policy grade_items_tenant_insert on "grade_items"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists grade_items_tenant_update on "grade_items";
create policy grade_items_tenant_update on "grade_items"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists grade_items_tenant_delete on "grade_items";
create policy grade_items_tenant_delete on "grade_items"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists grades_tenant_select on "grades";
create policy grades_tenant_select on "grades"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists grades_tenant_insert on "grades";
create policy grades_tenant_insert on "grades"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists grades_tenant_update on "grades";
create policy grades_tenant_update on "grades"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists grades_tenant_delete on "grades";
create policy grades_tenant_delete on "grades"
  for delete using (tenant_id = public.current_tenant_id());

drop policy if exists grade_overrides_tenant_select on "grade_overrides";
create policy grade_overrides_tenant_select on "grade_overrides"
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists grade_overrides_tenant_insert on "grade_overrides";
create policy grade_overrides_tenant_insert on "grade_overrides"
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists grade_overrides_tenant_update on "grade_overrides";
create policy grade_overrides_tenant_update on "grade_overrides"
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists grade_overrides_tenant_delete on "grade_overrides";
create policy grade_overrides_tenant_delete on "grade_overrides"
  for delete using (tenant_id = public.current_tenant_id());
