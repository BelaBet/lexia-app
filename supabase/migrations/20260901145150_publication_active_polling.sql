-- Busca ativa periódica de processos/prazos no JusBrasil (além do webhook já
-- existente). O usuário informa, por integração, a chave de API do JusBrasil
-- e o CPF/CNPJ e/ou número da OAB a monitorar; uma edge function
-- (poll-jusbrasil) consulta periodicamente e importa novidades como
-- publicações, do mesmo jeito que o webhook.
--
-- O agendamento em si (pg_cron) NÃO é criado automaticamente por esta
-- migration, pois depende da chave service_role do projeto (que só o usuário
-- possui) e da URL final do projeto — veja o arquivo
-- supabase/scripts/agendar_busca_ativa_jusbrasil.sql, que deve ser rodado
-- manualmente uma vez no SQL Editor do Supabase.

-- Extensões necessárias para o agendamento (seguras de habilitar agora;
-- não fazem nada sozinhas até o agendamento manual ser criado).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.publication_integrations
  ADD COLUMN IF NOT EXISTS monitor_document TEXT,
  ADD COLUMN IF NOT EXISTS monitor_oab TEXT,
  ADD COLUMN IF NOT EXISTS last_poll_status TEXT,
  ADD COLUMN IF NOT EXISTS last_poll_error TEXT;

COMMENT ON COLUMN public.publication_integrations.monitor_document IS 'CPF ou CNPJ a monitorar na busca ativa (ex: JusBrasil)';
COMMENT ON COLUMN public.publication_integrations.monitor_oab IS 'Número da OAB a monitorar na busca ativa (ex: 123456/SP)';
