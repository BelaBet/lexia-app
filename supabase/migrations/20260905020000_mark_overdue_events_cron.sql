-- QA: "overdue" era calculado só no frontend (computed_status em
-- useEvents.ts) — o status gravado em `events.status` nunca muda sozinho,
-- então qualquer outro módulo/consulta que leia `status` diretamente (sem
-- passar pela mesma lógica do frontend) via um evento atrasado como se
-- ainda estivesse "pending"/"in_progress". Esta migração torna "vencido"
-- uma transição real no banco: um job diário (pg_cron, mesma extensão já
-- usada pela busca ativa do JusBrasil) marca como 'overdue' qualquer
-- evento com event_date no passado que ainda esteja pending/in_progress.
--
-- Eventos completed/cancelled nunca são tocados (são estados finais). O
-- computed_status do frontend continua existindo como um cálculo imediato
-- (não depende de esperar o job rodar), mas agora é só uma conveniência —
-- a fonte de verdade eventualmente consistente passa a ser o próprio banco.

CREATE OR REPLACE FUNCTION public.mark_overdue_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.events
  SET status = 'overdue'
  WHERE status IN ('pending', 'in_progress')
    AND event_date < current_date;
$function$;

-- Roda todo dia às 00:05 no horário de Brasília (03:05 UTC) — qualquer
-- horário logo após a virada do dia serve, já que a condição é por DATA
-- (event_date < current_date), não por hora do evento.
SELECT cron.schedule(
  'mark-overdue-events-daily',
  '5 3 * * *',
  $$SELECT public.mark_overdue_events();$$
);
