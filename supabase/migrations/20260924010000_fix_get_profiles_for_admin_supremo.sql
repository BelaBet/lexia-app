-- get_profiles_for_admin() só liberava dados para role 'admin', mas quem
-- gerencia empresas (whitelabel_companies) é is_platform_admin(), que também
-- aceita 'supremo'. Sem este ajuste, um usuário 'supremo' via "Ver usuários"
-- em Empresas sempre via lista vazia (a query nunca "vazava" nada — falhava
-- fechada — mas também não funcionava para esse papel).
drop function if exists public.get_profiles_for_admin();

create function public.get_profiles_for_admin()
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  specialty text,
  company_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.full_name,
    p.avatar_url,
    p.specialty,
    p.company_id,
    p.created_at,
    p.updated_at
  from public.profiles p
  where public.is_platform_admin()
$$;

revoke all on function public.get_profiles_for_admin() from public, anon;
grant execute on function public.get_profiles_for_admin() to authenticated, service_role;
