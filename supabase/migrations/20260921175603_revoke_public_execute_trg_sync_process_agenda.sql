-- trg_sync_process_agenda() é uma função de TRIGGER (retorna trigger) que só
-- deve ser invocada pelo próprio mecanismo de trigger do Postgres, nunca
-- diretamente via RPC. Sendo SECURITY DEFINER, ficou exposta para anon e
-- authenticated via /rest/v1/rpc/trg_sync_process_agenda — qualquer usuário
-- autenticado (ou até anônimo) podia chamar essa função diretamente, rodando
-- com os privilégios do dono da função em vez dos dele mesmo.
--
-- Triggers disparam independente de grants de EXECUTE na role que fez o
-- DML — revogar aqui não quebra a sincronização Processo -> Agenda, só
-- fecha a via direta de chamada por RPC.
revoke execute on function public.trg_sync_process_agenda() from public;
revoke execute on function public.trg_sync_process_agenda() from anon;
revoke execute on function public.trg_sync_process_agenda() from authenticated;
