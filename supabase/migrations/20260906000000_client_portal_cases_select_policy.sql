-- CRÍTICO: a tabela public.cases nunca teve uma policy de SELECT que
-- permitisse ao CLIENTE do Portal (Meu Jurídico) ler a própria linha de
-- cases. A única policy de SELECT em cases é "auth.uid() = user_id" (o
-- advogado dono do processo) — nunca foi adicionada uma para
-- is_case_client(id), apesar de todo o resto do portal (case_clients,
-- case_timeline_events, client_requests, client_documents) já usar essa
-- função desde a migration 20260902195911_client_portal_meu_juridico.sql.
--
-- Efeito prático: useMyCases() (src/hooks/useClientPortal.ts) faz
--   from("case_clients").select("case_id, cases(...)")
-- A policy de case_clients libera a linha (is_case_client(case_id) = true),
-- mas o embed de "cases(...)" tenta ler public.cases — e como o cliente não
-- é o user_id dono, RLS bloqueia e o PostgREST devolve `cases: null` para
-- CADA linha. O hook então filtra tudo com `.filter(Boolean)`, resultando
-- numa lista de "Meus processos" sempre vazia para todo cliente, sempre —
-- não é um problema de segurança (não vaza dado de outro cliente), mas
-- quebra a funcionalidade por completo: nenhum cliente jamais conseguiu ver
-- os processos vinculados a ele no portal.
create policy "Clients can view their linked cases"
on public.cases for select
using (public.is_case_client(id));
