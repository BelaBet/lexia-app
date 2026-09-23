-- Cadastro de empresas (multi-empresa white label). Decisão de produto:
-- só admin/supremo da plataforma cria empresas e convida os usuários
-- delas (sem self-service e sem domínio próprio por empresa por
-- enquanto — o branding é resolvido pela empresa vinculada ao perfil do
-- usuário logado). O compartilhamento de dados (processos/clientes/etc)
-- entre membros da mesma empresa é um passo futuro, à parte: aqui só
-- entra o cadastro da empresa e da associação usuário↔empresa.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'supremo'::app_role)
$$;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and company_id = target_company_id
  )
$$;

drop policy if exists "Platform admins can view all companies" on public.whitelabel_companies;
create policy "Platform admins can view all companies" on public.whitelabel_companies
  for select to authenticated using (public.is_platform_admin());

drop policy if exists "Platform admins can create companies" on public.whitelabel_companies;
create policy "Platform admins can create companies" on public.whitelabel_companies
  for insert to authenticated with check (public.is_platform_admin());

drop policy if exists "Platform admins can update companies" on public.whitelabel_companies;
create policy "Platform admins can update companies" on public.whitelabel_companies
  for update to authenticated using (public.is_platform_admin());

drop policy if exists "Company members can view their own company" on public.whitelabel_companies;
create policy "Company members can view their own company" on public.whitelabel_companies
  for select to authenticated using (public.is_company_member(id));

-- company_id é atribuído só por quem cria/convida (edge functions com
-- service_role) — nunca pelo próprio usuário via update de perfil, senão
-- qualquer autenticado poderia se auto-associar a outra empresa.
revoke update (company_id) on public.profiles from authenticated;

-- handle_new_user() já lê full_name de raw_user_meta_data; passa a ler
-- também company_id, presente quando o cadastro vem do convite de
-- membro de empresa (supabase/functions/invite-company-member).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_name text;
  invited_company_id uuid;
begin
  safe_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'User');
  if length(safe_name) > 100 then
    safe_name := substring(safe_name from 1 for 100);
  end if;
  safe_name := regexp_replace(safe_name, '<[^>]*>', '', 'g');

  begin
    invited_company_id := nullif(new.raw_user_meta_data->>'company_id', '')::uuid;
  exception when invalid_text_representation then
    invited_company_id := null;
  end;

  insert into public.profiles (user_id, full_name, company_id)
  values (new.id, safe_name, invited_company_id);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'SECURITY DEFINER function - review carefully before modifications.
   Runs with elevated privileges during user registration.
   Input is sanitized: trimmed, length-limited to 100 chars, HTML tags stripped.
   company_id is only ever trusted from raw_user_meta_data when set by an
   admin-invoked service-role invite (invite-company-member) — never
   settable by the user themselves.';

-- get_profiles_for_admin() já existe (SECURITY DEFINER, restrito a
-- admin) e é a única forma da UI de administração ler profiles de
-- outros usuários — precisa devolver company_id para a tela de membros
-- da empresa poder filtrar por empresa. O retorno (colunas) mudou, então
-- a função precisa ser recriada do zero — dropar reseta os grants
-- default do Postgres, por isso eles são reaplicados logo abaixo,
-- idênticos aos da migration original (20260901000852).
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
  where public.has_role(auth.uid(), 'admin')
$$;

revoke execute on function public.get_profiles_for_admin() from anon, public;
grant execute on function public.get_profiles_for_admin() to authenticated;
