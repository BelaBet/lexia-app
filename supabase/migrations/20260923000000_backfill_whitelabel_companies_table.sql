-- whitelabel_companies e profiles.company_id já existiam em produção
-- (criados fora do controle de migrations, direto no painel/SQL editor do
-- Supabase) mas nunca foram versionados no repo. Esta migration só
-- documenta o estado atual: todo IF NOT EXISTS é no-op em produção, mas
-- garante que um banco novo (ambiente local/CI) fique com a mesma base
-- antes das mudanças de cadastro multi-empresa que seguem na próxima
-- migration.

create table if not exists public.whitelabel_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  document text,
  slug text not null unique,
  logo_url text,
  primary_color text,
  secondary_color text,
  custom_domain text,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  is_parent_company boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whitelabel_companies enable row level security;

alter table public.profiles
  add column if not exists company_id uuid references public.whitelabel_companies(id) on delete set null;
