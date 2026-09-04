-- Contador financeiro de pesquisas processuais por CNPJ/CPF monitorado.
-- Cada execução de busca ativa (poll-jusbrasil) e cada busca manual disparada
-- pelo usuário gera um registro de cobrança aqui, usando o valor configurado
-- em publication_integrations.price_per_search.

alter table public.publication_integrations
  add column if not exists price_per_search numeric(10,2);

create table if not exists public.process_search_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid references public.publication_integrations(id) on delete set null,
  source text not null,
  document text not null,
  document_type text not null default 'outro' check (document_type in ('cpf', 'cnpj', 'oab', 'outro')),
  search_type text not null check (search_type in ('manual', 'poll')),
  unit_price numeric(10,2) not null default 0,
  charged_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists process_search_charges_user_id_idx on public.process_search_charges(user_id);
create index if not exists process_search_charges_document_idx on public.process_search_charges(user_id, document);
create index if not exists process_search_charges_integration_id_idx on public.process_search_charges(integration_id);

alter table public.process_search_charges enable row level security;

create policy "Users can view their own search charges"
  on public.process_search_charges for select
  using (auth.uid() = user_id);

-- Gravação é feita pelas edge functions (service role) — nenhuma política de
-- insert/update/delete para usuários comuns é necessária.
