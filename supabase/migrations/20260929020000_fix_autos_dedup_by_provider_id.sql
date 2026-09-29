-- BUG (achado ao investigar "todos os processos devem conter os autos"):
-- syncCaseDetails() deduplicava anexos por source_url — mas o JusBrasil
-- devolve uma URL assinada (Google Cloud Storage, com Signature/Expires)
-- NOVA a cada vez que o mesmo documento é consultado, mesmo que o
-- documento em si não tenha mudado. Como a sincronização diária roda para
-- TODOS os processos, cada rodada gravava de novo o MESMO anexo como se
-- fosse um documento novo, porque a URL (a "chave" de deduplicação) nunca
-- batia com a URL salva anteriormente. Resultado: a lista de autos de um
-- processo crescia indefinidamente com cópias duplicadas do mesmo PDF.
--
-- Confirmado em produção: vários processos já com 2x (ou mais) o número de
-- documentos reais retornados pelo provedor na última sincronização.
--
-- Correção: adiciona provider_document_id, preenchido a partir do
-- identificador ESTÁVEL que o próprio payload de anexos já traz (primeira
-- posição da tupla, ex.: 8315914712) — esse id não muda entre consultas,
-- diferente da URL assinada. A deduplicação passa a usar
-- (result_id, provider_document_id) em vez de source_url.

alter table public.process_search_documents
  add column if not exists provider_document_id text;

create index if not exists idx_process_search_documents_provider_id
  on public.process_search_documents (result_id, provider_document_id)
  where provider_document_id is not null;
