-- Kanban de publicações: cada publicação passa por etapas de
-- acompanhamento (independentes do campo `status`, que continua
-- controlando prazo/vencimento). Toda mudança de etapa fica registrada em
-- publication_stage_history — histórico/auditoria por publicação, visível
-- na página dedicada de cada publicação (/publicacoes/:id).

alter table public.publications
  add column if not exists pipeline_stage text not null default 'novo'
  check (pipeline_stage in ('novo', 'em_analise', 'prazo_definido', 'providencia_tomada', 'concluido'));

comment on column public.publications.pipeline_stage is
  'Etapa do Kanban de acompanhamento da publicação (novo → em_analise → prazo_definido → providencia_tomada → concluido). Independente do campo status.';

create table if not exists public.publication_stage_history (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now()
);

comment on table public.publication_stage_history is
  'Histórico de mudanças de etapa do Kanban de cada publicação — gravado automaticamente por trigger, uma linha por transição (incluindo a criação).';

create index if not exists idx_publication_stage_history_publication_id
  on public.publication_stage_history (publication_id, changed_at);

alter table public.publication_stage_history enable row level security;

create policy "Users can view their own publication stage history"
on public.publication_stage_history for select
using (auth.uid() = user_id);

-- Inserção só acontece via trigger (security definer) — sem policy de
-- insert para o usuário autenticado, então o histórico não pode ser
-- forjado/editado pelo cliente.

create or replace function public.log_publication_stage_created()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.publication_stage_history(publication_id, user_id, from_stage, to_stage)
  values (new.id, new.user_id, null, new.pipeline_stage);
  return new;
end $$;

revoke all on function public.log_publication_stage_created() from public, anon, authenticated;

create trigger trg_log_publication_stage_created
  after insert on public.publications
  for each row execute function public.log_publication_stage_created();

create or replace function public.log_publication_stage_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.pipeline_stage is distinct from old.pipeline_stage then
    insert into public.publication_stage_history(publication_id, user_id, from_stage, to_stage)
    values (new.id, new.user_id, old.pipeline_stage, new.pipeline_stage);
  end if;
  return new;
end $$;

revoke all on function public.log_publication_stage_change() from public, anon, authenticated;

create trigger trg_log_publication_stage_change
  after update on public.publications
  for each row execute function public.log_publication_stage_change();
