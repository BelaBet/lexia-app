-- Corrige um gap de schema deixado pelo fluxo de prévia/confirmação de
-- busca paga por nome (preview-name-search / confirm-name-search): essas
-- edge functions já gravam status = 'preview' e as colunas preview_data /
-- estimated_cost / outcome_message em process_search_reports, mas a tabela
-- (criada em 20260904184937_name_search_crm.sql) nunca ganhou essas colunas
-- nem o valor 'preview' no CHECK de status — sem isso, todo INSERT/UPDATE
-- dessas funções falha contra o schema real.
--
-- IF NOT EXISTS / condicional em tudo para ser seguro de reaplicar caso
-- essas colunas já tenham sido adicionadas manualmente em produção por
-- fora do controle de migrations.

alter table public.process_search_reports
  add column if not exists preview_data jsonb,
  add column if not exists estimated_cost numeric,
  add column if not exists outcome_message text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.process_search_reports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%criando%'
  ) then
    execute (
      select format('alter table public.process_search_reports drop constraint %I', conname)
      from pg_constraint
      where conrelid = 'public.process_search_reports'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like '%status%criando%'
      limit 1
    );
  end if;
end $$;

alter table public.process_search_reports
  add constraint process_search_reports_status_check
  check (status in ('criando', 'preview', 'processando', 'concluido', 'erro'));
