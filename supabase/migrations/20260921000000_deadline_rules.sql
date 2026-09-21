-- Classificação automática de prazos por tipo de ato processual, por área do
-- direito. Serve de referência para o classificador em
-- _shared/deadlineClassifier.ts: ao chegar uma movimentação/publicação (via
-- webhook ou busca ativa), o conteúdo é comparado contra act_name (dentro da
-- área do caso, resolvida por cases.type) para detectar o ato e calcular o
-- prazo real em dias úteis (CPC art. 219) a partir do gatilho descrito em
-- trigger_description.
--
-- is_variable = true quando o prazo é uma faixa ("10 a 30 dias"), depende de
-- critério externo ("depende do órgão"), ou não tem gatilho identificável a
-- partir de uma única movimentação (ex.: prescrição, que depende do
-- histórico de suspensão/interrupção do processo) — nesses casos o
-- classificador NUNCA calcula uma data, só sinaliza revisão manual.
create table public.deadline_rules (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('civel', 'criminal', 'trabalhista', 'administrativo_tributario')),
  act_name text not null,
  deadline_value numeric,
  deadline_min numeric,
  deadline_max numeric,
  deadline_unit text not null check (deadline_unit in ('dias_uteis', 'anos')),
  is_variable boolean not null default false,
  trigger_description text,
  note text,
  created_at timestamptz not null default now(),
  unique (area, act_name)
);

alter table public.deadline_rules enable row level security;

-- Tabela de referência global (igual para todos os usuários), só leitura
-- pelo app; escrita é feita só via migration.
create policy "deadline_rules_select_authenticated"
  on public.deadline_rules for select
  to authenticated
  using (true);

-- Cível
insert into public.deadline_rules (area, act_name, deadline_value, deadline_unit, is_variable, trigger_description) values
  ('civel', 'Contestação', 15, 'dias_uteis', false, 'Conta da juntada do mandado/carta/AR ou da audiência de conciliação frustrada'),
  ('civel', 'Réplica', 15, 'dias_uteis', false, 'Após contestação'),
  ('civel', 'Recurso de Apelação', 15, 'dias_uteis', false, 'Conta da intimação da sentença'),
  ('civel', 'Embargos de Declaração', 5, 'dias_uteis', false, 'Suspende prazo para outros recursos'),
  ('civel', 'Agravo de Instrumento', 15, 'dias_uteis', false, 'Conta da intimação da decisão'),
  ('civel', 'Cumprimento de Sentença', 15, 'dias_uteis', false, 'Após intimação para pagar (impugnação)');

-- Criminal
insert into public.deadline_rules (area, act_name, deadline_value, deadline_unit, is_variable, trigger_description) values
  ('criminal', 'Resposta à Acusação', 10, 'dias_uteis', false, 'Após citação'),
  ('criminal', 'Recurso de Apelação', 5, 'dias_uteis', false, 'Após sentença'),
  ('criminal', 'Contrarrazões', 5, 'dias_uteis', false, 'Após intimação'),
  ('criminal', 'Embargos de Declaração', 2, 'dias_uteis', false, 'Após decisão'),
  ('criminal', 'Recurso em Sentido Estrito', 5, 'dias_uteis', false, 'Após decisão que o admite');

-- Trabalhista
insert into public.deadline_rules (area, act_name, deadline_value, deadline_unit, is_variable, trigger_description) values
  ('trabalhista', 'Contestação', null, 'dias_uteis', true, 'Na audiência — entrega presencial'),
  ('trabalhista', 'Recurso Ordinário', 8, 'dias_uteis', false, 'Após sentença'),
  ('trabalhista', 'Embargos de Declaração', 5, 'dias_uteis', false, 'Após decisão'),
  ('trabalhista', 'Recurso de Revista', 8, 'dias_uteis', false, 'Após acórdão do TRT'),
  ('trabalhista', 'Agravo de Instrumento', 8, 'dias_uteis', false, 'Após decisão que nega seguimento');

-- Administrativo (multas/fiscalizações) e Tributário federal
insert into public.deadline_rules (area, act_name, deadline_value, deadline_min, deadline_max, deadline_unit, is_variable, trigger_description) values
  ('administrativo_tributario', 'Defesa Prévia', null, 10, 30, 'dias_uteis', true, 'Depende do órgão (DETRAN, ANTT, ANVISA etc.)'),
  ('administrativo_tributario', 'Recurso Administrativo', null, 10, 30, 'dias_uteis', true, 'Conforme norma específica'),
  ('administrativo_tributario', 'Impugnação de Auto de Infração', 20, null, null, 'dias_uteis', false, 'Ex.: Receita Federal'),
  ('administrativo_tributario', 'Recurso ao CARF', 30, null, null, 'dias_uteis', false, 'Após ciência da decisão'),
  ('administrativo_tributario', 'Impugnação ao Lançamento', 30, null, null, 'dias_uteis', false, 'Receita Federal'),
  ('administrativo_tributario', 'Manifestação de Inconformidade', 30, null, null, 'dias_uteis', false, 'Após decisão da DRJ'),
  ('administrativo_tributario', 'Recurso Voluntário', 30, null, null, 'dias_uteis', false, 'Ao CARF'),
  ('administrativo_tributario', 'Recurso Especial', 15, null, null, 'dias_uteis', false, 'Ao Ministro da Fazenda');

-- Prescrição (medida em anos, sempre revisão manual — depende do histórico
-- de suspensão/interrupção do caso, que não é aferível a partir de uma
-- única movimentação/publicação).
insert into public.deadline_rules (area, act_name, deadline_value, deadline_min, deadline_max, deadline_unit, is_variable, trigger_description) values
  ('administrativo_tributario', 'Prescrição Intercorrente', null, 1, 6, 'anos', true, 'Após suspensão (1 ano de suspensão + 5 anos de prescrição intercorrente, em execução fiscal)'),
  ('trabalhista', 'Prescrição Trabalhista', 2, null, null, 'anos', true, 'Para ajuizar ação'),
  ('trabalhista', 'Prescrição Quinquenal Trabalhista', 5, null, null, 'anos', true, 'Limite de parcelas'),
  ('civel', 'Prescrição Civil', null, 3, 10, 'anos', true, 'Conforme tipo de obrigação');

-- Colunas em publications para guardar o resultado da classificação
-- automática — NUNCA substituem external_deadline/internal_deadline (que
-- seguem vindo cru da API/JusBrasil); são informação complementar exibida
-- lado a lado para o advogado comparar e confirmar.
alter table public.publications
  add column classified_area text,
  add column classified_act_name text,
  add column classified_deadline date,
  add column classified_deadline_unit text,
  add column classified_needs_review boolean not null default false,
  add column classified_rule_note text;

alter table public.publications
  add constraint publications_classified_area_check
  check (classified_area is null or classified_area in ('civel', 'criminal', 'trabalhista', 'administrativo_tributario'));

alter table public.publications
  add constraint publications_classified_deadline_unit_check
  check (classified_deadline_unit is null or classified_deadline_unit in ('dias_uteis', 'anos'));
