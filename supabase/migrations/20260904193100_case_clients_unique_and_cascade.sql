-- Reconcilia public.case_clients com o estado já aplicado em produção.
--
-- A edge function invite-client (que convida um cliente para o portal "Meu
-- Jurídico" e vincula o caso a ele) faz:
--   .from("case_clients").upsert({ case_id, client_id },
--     { onConflict: "case_id,client_id", ignoreDuplicates: true })
-- o que exige uma constraint UNIQUE (case_id, client_id) na tabela — ausente
-- na migração original (20260902195911_client_portal_meu_juridico.sql), que
-- não incluía essa função ainda. Verificado via introspecção que a
-- constraint já existe em produção (case_clients_case_id_client_id_key);
-- esta migração só sincroniza o repositório com o banco.
--
-- Também alinha as foreign keys para ON DELETE CASCADE (mesmo comportamento
-- já aplicado em produção): excluir um caso ou um cliente remove o vínculo
-- em case_clients junto, em vez de bloquear a exclusão.

ALTER TABLE public.case_clients DROP CONSTRAINT IF EXISTS case_clients_case_id_fkey;
ALTER TABLE public.case_clients
  ADD CONSTRAINT case_clients_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.case_clients DROP CONSTRAINT IF EXISTS case_clients_client_id_fkey;
ALTER TABLE public.case_clients
  ADD CONSTRAINT case_clients_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.case_clients DROP CONSTRAINT IF EXISTS case_clients_case_id_client_id_key;
ALTER TABLE public.case_clients
  ADD CONSTRAINT case_clients_case_id_client_id_key UNIQUE (case_id, client_id);
