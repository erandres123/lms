-- Supabase Custom Access Token Hook. Enable it in Dashboard -> Authentication ->
-- Hooks -> Customize Access Token (JWT) Claims and select this function.
-- Claims are resolved from the user's membership; with multiple memberships the
-- highest-privilege one wins until tenant switching is implemented.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  claims jsonb;
  v_tenant uuid;
  v_role text;
begin
  select ut.tenant_id, ut.role::text
    into v_tenant, v_role
    from public.user_tenants ut
   where ut.user_id = (event->>'user_id')::uuid
   order by case ut.role
              when 'school_admin' then 0
              when 'teacher' then 1
              when 'student' then 2
              else 3
            end,
            ut.created_at
   limit 1;

  claims := coalesce(event->'claims', '{}'::jsonb);

  if v_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant select on table public.user_tenants to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    revoke execute on function public.custom_access_token_hook(jsonb)
      from authenticated, anon, public;
  end if;
end $$;
