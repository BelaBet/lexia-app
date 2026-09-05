-- Correção (pedido explícito): a "busca ativa diária" (Integrações >
-- JusBrasil) monitorava CPF/CNPJ via um produto da API (background-check)
-- que, na prática, o contrato do cliente com o JusBrasil não suporta — só a
-- busca por NOME/RAZÃO SOCIAL (produto "Consulta Processual por Nome" /
-- relatorio_nome, o mesmo já usado pelo CRM de Busca de Processos) funciona.
-- Esta migração adiciona os campos necessários para a busca ativa também
-- usar nome/razão social, no mesmo modelo assíncrono (criar relatório ->
-- encomendar -> exportar) já validado no CRM.
--
-- monitor_document (CPF/CNPJ) é mantido na tabela por segurança (não
-- descartamos dado já gravado), mas deixa de ser usado pela lógica de busca
-- — ver supabase/functions/_shared/pollJusbrasilIntegration.ts.

ALTER TABLE public.publication_integrations
  ADD COLUMN IF NOT EXISTS monitor_name TEXT,
  ADD COLUMN IF NOT EXISTS jusbrasil_report_id TEXT;

COMMENT ON COLUMN public.publication_integrations.monitor_name IS 'Nome ou razão social a monitorar na busca ativa diária via JusBrasil (relatório por nome) — substitui monitor_document, que a API não suporta para este contrato.';
COMMENT ON COLUMN public.publication_integrations.jusbrasil_report_id IS 'ID do relatório (live_report_def) criado no JusBrasil para a busca ativa por nome desta integração — reaproveitado a cada busca em vez de criar um relatório novo toda vez.';
COMMENT ON COLUMN public.publication_integrations.monitor_document IS 'OBSOLETO (BUG-001): CPF/CNPJ não é suportado como busca ativa pelo contrato JusBrasil atual — mantido apenas para não perder dado já gravado. Use monitor_name.';
