-- Criação de documentos passa a permitir: nome do responsável e um prazo
-- que, quando preenchido, vira um evento na Agenda automaticamente.
-- deadline_event_id guarda o vínculo com esse evento para permitir
-- atualizar a data (ou remover o evento) quando o prazo do documento é
-- editado, em vez de duplicar eventos a cada salvamento.
alter table public.documents
  add column if not exists responsible_name text,
  add column if not exists deadline_date date,
  add column if not exists deadline_event_id uuid references public.events(id) on delete set null;
