-- Close the two remaining authorization gaps:
-- 1) authenticated admins must not mutate user_roles directly;
-- 2) tenant/company assignment is backend-controlled and never trusted from signup metadata.

drop policy if exists "Admins can insert user roles" on public.user_roles;
drop policy if exists "Admins can update all user roles" on public.user_roles;
drop policy if exists "Admins can delete user roles" on public.user_roles;
revoke insert, update, delete on table public.user_roles from authenticated;
revoke insert, update, delete on table public.user_roles from anon;

drop policy if exists "Admins can view all user roles" on public.user_roles;
drop policy if exists "Platform admins can view all user roles" on public.user_roles;
create policy "Platform admins can view all user roles"
on public.user_roles for select to authenticated
using (public.is_platform_admin());

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles for insert to authenticated
with check (auth.uid() = user_id and company_id is null);

create or replace function public.protect_profile_company_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'A associação à empresa só pode ser alterada pelo fluxo administrativo autorizado'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_profile_company_assignment() from public;
revoke all on function public.protect_profile_company_assignment() from anon;
revoke all on function public.protect_profile_company_assignment() from authenticated;

drop trigger if exists protect_profile_company_assignment on public.profiles;
create trigger protect_profile_company_assignment
before update of company_id on public.profiles
for each row execute function public.protect_profile_company_assignment();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_name text;
begin
  safe_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'User');
  if length(safe_name) > 100 then
    safe_name := substring(safe_name from 1 for 100);
  end if;
  safe_name := regexp_replace(safe_name, '<[^>]*>', '', 'g');

  insert into public.profiles (user_id, full_name, company_id)
  values (new.id, safe_name, null);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  return new;
end;
$$;
