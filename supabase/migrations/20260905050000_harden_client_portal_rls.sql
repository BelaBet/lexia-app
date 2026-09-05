-- Bugs de segurança/integridade encontrados por QA no Portal do Cliente
-- ("Meu Jurídico"):
--
-- BUG-04 — a política "Clients can mark their requests fulfilled" (UPDATE
-- em client_requests) só verifica is_case_client(case_id), sem restringir
-- QUAIS colunas o cliente pode alterar. RLS não tem como restringir
-- colunas diretamente numa policy (ela opera na linha inteira) — por isso
-- usamos um trigger BEFORE UPDATE para impedir que o cliente altere
-- qualquer coisa além de status (só para 'fulfilled') e fulfilled_at. O
-- dono do processo continua podendo alterar qualquer campo normalmente
-- (coberto pela policy "Owners can manage requests").
--
-- BUG-05 — a política de INSERT em client_documents confirma que quem
-- está inserindo é dono ou cliente do processo e que `uploaded_by` bate
-- com o papel de quem está enviando, mas nunca confere que
-- `uploaded_by_user_id` é de fato quem está autenticado — uma chamada
-- direta à API poderia informar outro uploaded_by_user_id e falsificar a
-- autoria do documento.

create or replace function public.enforce_client_request_fulfillment_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Dono do processo pode alterar qualquer campo da solicitação (já
  -- coberto pela policy "Owners can manage requests" — aqui só deixamos
  -- passar sem restrição adicional).
  if public.is_case_owner(new.case_id) then
    return new;
  end if;

  -- Chegou aqui sem ser dono: só pode ter passado pela policy "Clients
  -- can mark their requests fulfilled", ou seja, é um cliente vinculado
  -- ao processo. Restringe à ação que essa policy pretende permitir:
  -- marcar a própria solicitação como cumprida.
  if new.case_id is distinct from old.case_id
     or new.created_by is distinct from old.created_by
     or new.type is distinct from old.type
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.due_date is distinct from old.due_date
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Cliente só pode marcar a solicitação como cumprida, não alterar seus outros campos.';
  end if;

  if new.status is distinct from old.status and new.status <> 'fulfilled' then
    raise exception 'Cliente só pode alterar o status da solicitação para "fulfilled".';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_client_request_fulfillment_only on public.client_requests;
create trigger trg_enforce_client_request_fulfillment_only
  before update on public.client_requests
  for each row execute function public.enforce_client_request_fulfillment_only();

comment on function public.enforce_client_request_fulfillment_only() is
  'Complementa a RLS de client_requests: a policy de UPDATE do cliente não restringe colunas (RLS não faz isso por linha), então este trigger garante que um cliente só consiga marcar status = fulfilled/fulfilled_at, nunca reescrever título, descrição, prazo etc. da solicitação (ver migration 20260905050000_harden_client_portal_rls.sql).';

drop policy if exists "Involved parties can upload documents" on public.client_documents;
create policy "Involved parties can upload documents"
  on public.client_documents
  for insert
  with check (
    (
      (public.is_case_owner(case_id) and uploaded_by = 'lawyer'::client_document_uploader)
      or
      (public.is_case_client(case_id) and uploaded_by = 'client'::client_document_uploader)
    )
    and uploaded_by_user_id = auth.uid()
  );
