-- "Bloqueios e Feriados" da Agenda: dias (ou períodos) sem expediente
-- forense — feriados nacionais/estaduais/municipais, recesso forense
-- (CPC art. 220: 20/dez a 20/jan) e bloqueios internos do escritório
-- (ex.: recesso da comarca, greve do Judiciário, ponto facultativo local).
--
-- Motivação (pedido explícito, 05/09): quando um prazo (external_deadline)
-- chega via API (JusBrasil, webhook ou busca ativa), ele vem "cru" — só a
-- data que o provedor calculou. Mas pela regra processual (CPC art. 224
-- §1º: "os prazos somente começam a correr em dia de expediente forense e,
-- se o dia do vencimento cair em dia sem expediente, prorrogam-se para o
-- próximo dia útil"), se esse prazo cair num feriado/bloqueio, a data real
-- de vencimento é outra. Esta tabela é a fonte de verdade para esse
-- cálculo (ver supabase/functions/_shared/businessDays.ts), usada tanto no
-- webhook quanto na busca ativa antes de gravar o prazo em `publications`.
--
-- Linhas com user_id NULL são globais (feriados nacionais e o recesso
-- forense do CPC, semeados abaixo, visíveis para todas as contas). Linhas
-- com user_id preenchido são bloqueios específicos daquele escritório —
-- feriado estadual/municipal da comarca dele, ou um bloqueio pontual (ex.:
-- greve, calamidade local) que só ele precisa registrar.

create table if not exists public.agenda_blocked_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  title text not null,
  scope text not null default 'nacional' check (scope in ('nacional', 'estadual', 'municipal', 'comarca', 'interno')),
  created_at timestamptz not null default now(),
  constraint agenda_blocked_dates_valid_range check (end_date >= start_date)
);

comment on table public.agenda_blocked_dates is
  'Dias/períodos sem expediente forense usados para calcular o prazo real de resposta (ver _shared/businessDays.ts). user_id NULL = feriado/recesso global (visível a todos); preenchido = bloqueio específico daquele escritório (feriado local da comarca, greve, etc.).';

create index if not exists agenda_blocked_dates_range_idx on public.agenda_blocked_dates (start_date, end_date);
create index if not exists agenda_blocked_dates_user_idx on public.agenda_blocked_dates (user_id);

alter table public.agenda_blocked_dates enable row level security;

-- Todo usuário autenticado enxerga os bloqueios globais + os próprios.
create policy "agenda_blocked_dates_select" on public.agenda_blocked_dates
  for select to authenticated
  using (user_id is null or user_id = auth.uid());

-- Só é possível criar/editar/excluir bloqueios da própria conta — os
-- globais (user_id null) são geridos só por migration/service role.
create policy "agenda_blocked_dates_insert" on public.agenda_blocked_dates
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "agenda_blocked_dates_update" on public.agenda_blocked_dates
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "agenda_blocked_dates_delete" on public.agenda_blocked_dates
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Seed: feriados nacionais fixos e móveis (2025-2030) + recesso forense
-- (CPC art. 220, 20/dez a 20/jan de cada virada de ano) — datas móveis
-- (Carnaval, Sexta-feira Santa, Corpus Christi) calculadas a partir da
-- Páscoa (algoritmo de Gauss) e conferidas manualmente.
-- ---------------------------------------------------------------------

insert into public.agenda_blocked_dates (user_id, start_date, end_date, title, scope) values
  -- Feriados nacionais fixos
  (null, '2025-01-01', '2025-01-01', 'Confraternização Universal', 'nacional'),
  (null, '2025-04-21', '2025-04-21', 'Tiradentes', 'nacional'),
  (null, '2025-05-01', '2025-05-01', 'Dia do Trabalho', 'nacional'),
  (null, '2025-09-07', '2025-09-07', 'Independência do Brasil', 'nacional'),
  (null, '2025-10-12', '2025-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  (null, '2025-11-02', '2025-11-02', 'Finados', 'nacional'),
  (null, '2025-11-15', '2025-11-15', 'Proclamação da República', 'nacional'),
  (null, '2025-11-20', '2025-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  (null, '2025-12-25', '2025-12-25', 'Natal', 'nacional'),
  (null, '2026-01-01', '2026-01-01', 'Confraternização Universal', 'nacional'),
  (null, '2026-04-21', '2026-04-21', 'Tiradentes', 'nacional'),
  (null, '2026-05-01', '2026-05-01', 'Dia do Trabalho', 'nacional'),
  (null, '2026-09-07', '2026-09-07', 'Independência do Brasil', 'nacional'),
  (null, '2026-10-12', '2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  (null, '2026-11-02', '2026-11-02', 'Finados', 'nacional'),
  (null, '2026-11-15', '2026-11-15', 'Proclamação da República', 'nacional'),
  (null, '2026-11-20', '2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  (null, '2026-12-25', '2026-12-25', 'Natal', 'nacional'),
  (null, '2027-01-01', '2027-01-01', 'Confraternização Universal', 'nacional'),
  (null, '2027-04-21', '2027-04-21', 'Tiradentes', 'nacional'),
  (null, '2027-05-01', '2027-05-01', 'Dia do Trabalho', 'nacional'),
  (null, '2027-09-07', '2027-09-07', 'Independência do Brasil', 'nacional'),
  (null, '2027-10-12', '2027-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  (null, '2027-11-02', '2027-11-02', 'Finados', 'nacional'),
  (null, '2027-11-15', '2027-11-15', 'Proclamação da República', 'nacional'),
  (null, '2027-11-20', '2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  (null, '2027-12-25', '2027-12-25', 'Natal', 'nacional'),
  (null, '2028-01-01', '2028-01-01', 'Confraternização Universal', 'nacional'),
  (null, '2028-04-21', '2028-04-21', 'Tiradentes', 'nacional'),
  (null, '2028-05-01', '2028-05-01', 'Dia do Trabalho', 'nacional'),
  (null, '2028-09-07', '2028-09-07', 'Independência do Brasil', 'nacional'),
  (null, '2028-10-12', '2028-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  (null, '2028-11-02', '2028-11-02', 'Finados', 'nacional'),
  (null, '2028-11-15', '2028-11-15', 'Proclamação da República', 'nacional'),
  (null, '2028-11-20', '2028-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  (null, '2028-12-25', '2028-12-25', 'Natal', 'nacional'),
  (null, '2029-01-01', '2029-01-01', 'Confraternização Universal', 'nacional'),
  (null, '2029-04-21', '2029-04-21', 'Tiradentes', 'nacional'),
  (null, '2029-05-01', '2029-05-01', 'Dia do Trabalho', 'nacional'),
  (null, '2029-09-07', '2029-09-07', 'Independência do Brasil', 'nacional'),
  (null, '2029-10-12', '2029-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  (null, '2029-11-02', '2029-11-02', 'Finados', 'nacional'),
  (null, '2029-11-15', '2029-11-15', 'Proclamação da República', 'nacional'),
  (null, '2029-11-20', '2029-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  (null, '2029-12-25', '2029-12-25', 'Natal', 'nacional'),
  (null, '2030-01-01', '2030-01-01', 'Confraternização Universal', 'nacional'),
  (null, '2030-04-21', '2030-04-21', 'Tiradentes', 'nacional'),
  (null, '2030-05-01', '2030-05-01', 'Dia do Trabalho', 'nacional'),
  (null, '2030-09-07', '2030-09-07', 'Independência do Brasil', 'nacional'),
  (null, '2030-10-12', '2030-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  (null, '2030-11-02', '2030-11-02', 'Finados', 'nacional'),
  (null, '2030-11-15', '2030-11-15', 'Proclamação da República', 'nacional'),
  (null, '2030-11-20', '2030-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  (null, '2030-12-25', '2030-12-25', 'Natal', 'nacional'),

  -- Feriados móveis (Carnaval — segunda e terça —, Sexta-feira Santa, Corpus Christi)
  (null, '2025-03-03', '2025-03-04', 'Carnaval', 'nacional'),
  (null, '2025-04-18', '2025-04-18', 'Sexta-feira Santa', 'nacional'),
  (null, '2025-06-19', '2025-06-19', 'Corpus Christi', 'nacional'),
  (null, '2026-02-16', '2026-02-17', 'Carnaval', 'nacional'),
  (null, '2026-04-03', '2026-04-03', 'Sexta-feira Santa', 'nacional'),
  (null, '2026-06-04', '2026-06-04', 'Corpus Christi', 'nacional'),
  (null, '2027-02-08', '2027-02-09', 'Carnaval', 'nacional'),
  (null, '2027-03-26', '2027-03-26', 'Sexta-feira Santa', 'nacional'),
  (null, '2027-05-27', '2027-05-27', 'Corpus Christi', 'nacional'),
  (null, '2028-02-28', '2028-02-29', 'Carnaval', 'nacional'),
  (null, '2028-04-14', '2028-04-14', 'Sexta-feira Santa', 'nacional'),
  (null, '2028-06-15', '2028-06-15', 'Corpus Christi', 'nacional'),
  (null, '2029-02-12', '2029-02-13', 'Carnaval', 'nacional'),
  (null, '2029-03-30', '2029-03-30', 'Sexta-feira Santa', 'nacional'),
  (null, '2029-05-31', '2029-05-31', 'Corpus Christi', 'nacional'),
  (null, '2030-03-04', '2030-03-05', 'Carnaval', 'nacional'),
  (null, '2030-04-19', '2030-04-19', 'Sexta-feira Santa', 'nacional'),
  (null, '2030-06-20', '2030-06-20', 'Corpus Christi', 'nacional'),

  -- Recesso forense (CPC art. 220: suspende-se o prazo processual entre
  -- 20/dez e 20/jan, inclusive) — um período por virada de ano.
  (null, '2025-12-20', '2026-01-20', 'Recesso Forense (CPC art. 220)', 'nacional'),
  (null, '2026-12-20', '2027-01-20', 'Recesso Forense (CPC art. 220)', 'nacional'),
  (null, '2027-12-20', '2028-01-20', 'Recesso Forense (CPC art. 220)', 'nacional'),
  (null, '2028-12-20', '2029-01-20', 'Recesso Forense (CPC art. 220)', 'nacional'),
  (null, '2029-12-20', '2030-01-20', 'Recesso Forense (CPC art. 220)', 'nacional')
on conflict do nothing;
