-- Dados de demonstração: um conjunto realista e diverso, cobrindo
-- Processos, Agenda (os 6 tipos), Publicações e Checklists/Documentos, para
-- Roberta demonstrar o produto sem depender de dados reais de cliente.
--
-- Toda linha de demo é marcada com is_demo = true na própria tabela (em vez
-- de um registro auxiliar separado) para que o botão "Apagar dados de
-- demonstração" no header possa limpar tudo com uma consulta simples por
-- tabela — sem heurística nenhuma, sem risco de apagar dado real.

alter table public.cases add column if not exists is_demo boolean not null default false;
alter table public.events add column if not exists is_demo boolean not null default false;
alter table public.checklists add column if not exists is_demo boolean not null default false;
alter table public.publications add column if not exists is_demo boolean not null default false;
alter table public.documents add column if not exists is_demo boolean not null default false;

comment on column public.cases.is_demo is 'Processo de demonstração, criado para popular a tela — não é um cliente real. Removível pelo botão "Apagar dados de demonstração".';
comment on column public.events.is_demo is 'Item de Agenda de demonstração — ver comentário em cases.is_demo.';
comment on column public.checklists.is_demo is 'Checklist de demonstração — ver comentário em cases.is_demo.';
comment on column public.publications.is_demo is 'Publicação de demonstração — ver comentário em cases.is_demo.';
comment on column public.documents.is_demo is 'Documento de demonstração — ver comentário em cases.is_demo.';

create index if not exists idx_cases_user_is_demo on public.cases (user_id, is_demo) where is_demo;
create index if not exists idx_events_user_is_demo on public.events (user_id, is_demo) where is_demo;
create index if not exists idx_checklists_user_is_demo on public.checklists (user_id, is_demo) where is_demo;
create index if not exists idx_publications_user_is_demo on public.publications (user_id, is_demo) where is_demo;
create index if not exists idx_documents_user_is_demo on public.documents (user_id, is_demo) where is_demo;

-- Função de limpeza: SECURITY DEFINER para poder apagar de todas as tabelas
-- num só clique sem precisar de 5 policies de DELETE adicionais no
-- frontend. Nunca recebe um user_id por parâmetro — sempre usa auth.uid()
-- de quem chamou — então cada conta só consegue apagar a própria
-- demonstração, nunca a de outra conta.
--
-- NOTA: os eventos de demo que representam "prazo externo/interno"
-- propositalmente NÃO têm publication_id preenchido (mesmo simulando uma
-- publicação da API) — só o suficiente para ilustrar o tipo/rótulo, sem
-- acionar a trava de exclusão de evento automático
-- (trg_prevent_delete_api_event), que só abre exceção para o papel
-- service_role. Isso mantém a função de limpeza simples, sem precisar
-- alterar o owner dela.
create or replace function public.delete_demo_data()
returns table(table_name text, deleted_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count bigint;
begin
  if v_user_id is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  delete from public.events where user_id = v_user_id and is_demo;
  get diagnostics v_count = row_count;
  table_name := 'events'; deleted_count := v_count; return next;

  delete from public.publications where user_id = v_user_id and is_demo;
  get diagnostics v_count = row_count;
  table_name := 'publications'; deleted_count := v_count; return next;

  delete from public.checklists where user_id = v_user_id and is_demo;
  get diagnostics v_count = row_count;
  table_name := 'checklists'; deleted_count := v_count; return next;

  delete from public.documents where user_id = v_user_id and is_demo;
  get diagnostics v_count = row_count;
  table_name := 'documents'; deleted_count := v_count; return next;

  delete from public.cases where user_id = v_user_id and is_demo;
  get diagnostics v_count = row_count;
  table_name := 'cases'; deleted_count := v_count; return next;

  return;
end;
$function$;

revoke all on function public.delete_demo_data() from public;
grant execute on function public.delete_demo_data() to authenticated;

-- Semente de dados — conta de demonstração: r.2019uk@gmail.com
-- (92b10230-a997-4560-afdb-f206ae678ea1). Datas relativas a hoje (current_date)
-- para a demonstração continuar fazendo sentido (prazo "crítico" continua
-- crítico) não importa quando for aberta.
do $$
declare
  v_user_id uuid := '92b10230-a997-4560-afdb-f206ae678ea1';
  v_case1 uuid := '41d4de01-76b2-46e9-8f9d-668d27fc4418'; -- Cível — Ação de Cobrança
  v_case2 uuid := '44b170d6-e63f-47e6-8014-43341a264fee'; -- Trabalhista — Reclamação Trabalhista
  v_case3 uuid := 'e8df9f3a-c31f-4594-87a7-769192ea7ebb'; -- Família — Divórcio Litigioso
  v_case4 uuid := '008c284b-53f7-43ee-b345-34af091c3a1b'; -- Criminal — Defesa Criminal
  v_case5 uuid := '21899543-cc83-46e7-9173-66fbed456719'; -- Tributário — Execução Fiscal (alto valor)
  v_case6 uuid := '5286b689-3541-4a6e-af39-fc8ce401e34e'; -- Administrativo — Mandado de Segurança (encerrado)
  v_pub1 uuid := 'be77b9ec-44fd-40ac-bfc9-6541a2f43bc3';
begin
  insert into public.cases (id, user_id, case_number, title, client, parte_diversa, type, status, vara, comarca, valor_causa, data_abertura_tribunal, data_aceitacao, is_demo)
  values
    (v_case1, v_user_id, '0001234-56.2025.8.17.0060', 'Ação de Cobrança', 'Comércio Nordeste Ltda', 'Distribuidora Agreste S.A.', 'Cível', 'active', '3ª Vara Cível', 'Caruaru/PE', 85000, current_date - 60, current_date - 55, true),
    (v_case2, v_user_id, '0002345-67.2025.5.06.0012', 'Reclamação Trabalhista', 'Maria Aparecida Silva', 'Confecções Pernambuco Ltda', 'Trabalhista', 'active', '12ª Vara do Trabalho', 'Recife/PE', 42000, current_date - 40, current_date - 35, true),
    (v_case3, v_user_id, '0003456-78.2025.8.17.0060', 'Divórcio Litigioso', 'Carlos Eduardo Ferreira', 'Juliana Ferreira Nascimento', 'Família', 'active', '2ª Vara de Família', 'Caruaru/PE', null, current_date - 20, current_date - 15, true),
    (v_case4, v_user_id, '0004567-89.2025.8.17.0060', 'Defesa Criminal', 'José Roberto Lima', 'Ministério Público de Pernambuco', 'Criminal', 'pending', '1ª Vara Criminal', 'Caruaru/PE', null, current_date - 10, null, true),
    (v_case5, v_user_id, '0005678-90.2025.8.17.0060', 'Execução Fiscal', 'Indústria Pernambucana S.A.', 'Município de Caruaru', 'Tributário', 'active', 'Vara da Fazenda Pública', 'Caruaru/PE', 2300000, current_date - 90, current_date - 85, true),
    (v_case6, v_user_id, '0006789-01.2024.8.17.0060', 'Mandado de Segurança', 'Ana Paula Costa', 'Secretaria de Fazenda Municipal', 'Administrativo', 'closed', 'Vara da Fazenda Pública', 'Caruaru/PE', 12000, current_date - 200, current_date - 195, true)
  on conflict (id) do nothing;

  insert into public.publications (id, user_id, case_id, process_number, source, content, published_date, external_deadline, external_responsible_name, external_responsible_role, internal_deadline, internal_responsible_name, internal_responsible_role, tese, status, imported_automatically, vara, comarca, valor_causa, is_demo)
  values (
    v_pub1, v_user_id, v_case5, '0005678-90.2025.8.17.0060', 'jusbrasil',
    'Intimação para manifestação sobre os embargos à execução fiscal opostos pela executada, no prazo legal, sob pena de preclusão.',
    current_date - 3, current_date + 2, 'Roberta Waleska', 'advogado', current_date + 1, 'Roberta Waleska', 'advogado',
    'Prescrição intercorrente da execução fiscal (art. 40, §4º da LEF)', 'pending', true,
    'Vara da Fazenda Pública', 'Caruaru/PE', 2300000, true
  )
  on conflict (id) do nothing;

  -- Os 6 tipos do Calendário Jurídico, todos vinculados a um processo. Os 2
  -- de "prazo" (externo/interno) simulam uma publicação da API só no rótulo
  -- e conteúdo — sem publication_id de verdade (ver nota acima sobre a
  -- trava de exclusão), então continuam apagáveis normalmente.
  insert into public.events (user_id, case_id, publication_id, title, description, event_date, event_time, type, location, status, priority, is_demo)
  values
    (v_user_id, v_case5, null, 'Prazo Externo: Execução Fiscal 0005678-90.2025.8.17.0060', 'Intimação para manifestação sobre os embargos à execução fiscal.', current_date + 2, '09:00:00', 'prazo_externo', null, 'pending', 'high', true),
    (v_user_id, v_case5, null, 'Prazo Interno: Execução Fiscal 0005678-90.2025.8.17.0060', 'Prazo de controle interno do escritório (1 dia de folga antes do prazo externo).', current_date + 1, '09:00:00', 'prazo_interno', null, 'pending', 'medium', true),
    (v_user_id, v_case2, null, 'Audiência de Instrução e Julgamento', 'Oitiva de testemunhas — reclamação trabalhista.', current_date + 5, '14:00:00', 'hearing', 'Fórum Trabalhista de Recife', 'pending', 'high', true),
    (v_user_id, v_case1, null, 'Elaborar réplica à contestação', 'Revisar contestação apresentada e preparar réplica.', current_date + 1, '10:00:00', 'tarefa', null, 'pending', 'high', true),
    (v_user_id, v_case3, null, 'Reunião com cliente — alinhamento de partilha de bens', 'Discutir proposta de partilha antes da próxima audiência.', current_date + 7, '16:00:00', 'meeting', 'Escritório Ankor Tech', 'pending', 'medium', true),
    (v_user_id, v_case5, null, 'Protocolar embargos de declaração', 'Procedimento de acompanhamento da execução fiscal.', current_date + 10, '11:00:00', 'procedimento', null, 'pending', 'medium', true),
    (v_user_id, v_case4, null, 'Audiência de instrução — Vara Criminal', 'Evento processual: oitiva do réu e testemunhas de defesa.', current_date + 15, '09:30:00', 'evento_processual', '1ª Vara Criminal de Caruaru', 'pending', 'medium', true)
  on conflict do nothing;

  insert into public.event_participants (event_id, name, email, invite_sent)
  select id, 'Dr. Marcos Andrade', 'marcos.andrade@exemplo.com.br', false
  from public.events
  where user_id = v_user_id and is_demo and type = 'meeting'
  limit 1;

  insert into public.checklists (user_id, case_id, client_name, title, description, context, priority, status, due_date, is_demo)
  values
    (v_user_id, v_case4, 'José Roberto Lima', 'Coleta de provas e documentos da defesa', 'Reunir depoimentos, laudos e documentos para a defesa criminal.', 'case', 'high', 'in_progress', current_date + 4, true),
    (v_user_id, v_case6, 'Ana Paula Costa', 'Arquivamento do processo encerrado', 'Checklist de encerramento — processo já concluído, sem prazo pendente real.', 'case', 'low', 'in_progress', current_date + 5, true)
  on conflict do nothing;

  insert into public.documents (user_id, title, type, content, status, is_demo)
  values
    (v_user_id, 'Petição Inicial — Ação de Cobrança', 'peticao', 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA CÍVEL DA COMARCA DE CARUARU/PE... (documento de demonstração)', 'final', true),
    (v_user_id, 'Contestação — Reclamação Trabalhista', 'contestacao', 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DO TRABALHO DA 12ª VARA DO TRABALHO DE RECIFE/PE... (documento de demonstração)', 'draft', true),
    (v_user_id, 'Parecer Jurídico — Execução Fiscal', 'parecer', 'PARECER JURÍDICO. Assunto: prescrição intercorrente em execução fiscal... (documento de demonstração)', 'draft', true)
  on conflict do nothing;
end $$;

-- O prazo "já vencido" (para demonstrar o status "Atrasado" calculado
-- automaticamente em getEffectiveEventStatus, ver useEvents.ts) precisa de
-- data passada, e a trava de evento retroativo (prevent_retroactive_event)
-- é absoluta para qualquer papel — só abre exceção para o papel
-- service_role, o mesmo usado pela integração ao importar um prazo cuja
-- data externa já passou. Motivo idêntico ao de um prazo real chegando
-- atrasado por atraso de sincronização.
set local role service_role;
insert into public.events (user_id, case_id, publication_id, title, description, event_date, event_time, type, location, status, priority, is_demo)
values (
  '92b10230-a997-4560-afdb-f206ae678ea1', '41d4de01-76b2-46e9-8f9d-668d27fc4418', null,
  'Protocolar manifestação sobre laudo pericial',
  'Prazo já vencido — demonstra o status "Atrasado" calculado automaticamente.',
  current_date - 3, '10:00:00', 'deadline', null, 'pending', 'high', true
);
reset role;
