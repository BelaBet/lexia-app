-- "Rastreamento de Publicações": adiciona o botão "Rastrear" para processos
-- já existentes em Processos. Ao clicar, o processo é registrado no
-- monitoramento direto por CNJ do JusBrasil (endpoint
-- api/monitoramento/proc, ver supabase/functions/jusbrasil-monitor-process)
-- para receber publicações futuras automaticamente via jusbrasil-webhook.
--
-- Esses dois campos guardam, por processo, se o rastreamento já foi
-- registrado no provedor e quando — evitam registrar (e cobrar) o mesmo
-- processo mais de uma vez e permitem mostrar "Rastreando" em vez de
-- "Rastrear" na tela.
alter table public.cases
  add column if not exists jusbrasil_monitoring_active boolean not null default false,
  add column if not exists jusbrasil_monitoring_started_at timestamptz;
