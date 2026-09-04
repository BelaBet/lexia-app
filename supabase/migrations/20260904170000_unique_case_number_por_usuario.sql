-- Corrige uma condição de corrida: findOrCreateCaseId (usada por
-- publication-webhook e poll-jusbrasil/manual-process-search) faz um SELECT
-- seguido de INSERT para abrir automaticamente um Caso a partir do número
-- do processo. Sem uma constraint de unicidade, duas chamadas concorrentes
-- para o mesmo processo (ex.: webhook e busca ativa recebendo a mesma
-- novidade quase ao mesmo tempo) podiam passar as duas pelo SELECT antes de
-- qualquer INSERT terminar, criando dois Casos duplicados para o mesmo
-- processo. O código já tem um fallback que refaz o SELECT quando o INSERT
-- falha por conflito — só faltava a constraint para esse conflito existir.
create unique index if not exists cases_user_id_case_number_key
  on public.cases (user_id, case_number);
