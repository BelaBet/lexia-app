-- Decisão de produto (pedido explícito): nenhum processo mais é criado
-- manualmente pelo usuário. Todo processo na tabela "cases" passa a ser
-- criado exclusivamente pelas integrações automáticas com o JusBrasil —
-- webhook de publicações (supabase/functions/publication-webhook) e busca
-- ativa (supabase/functions/_shared/pollJusbrasilIntegration.ts, usada por
-- poll-jusbrasil e manual-process-search) — que rodam com a service role e
-- não são afetadas por esta mudança, pois a service role sempre ignora RLS.
--
-- Removemos a política de INSERT do usuário autenticado para que nem uma
-- chamada direta à API REST do Supabase consiga criar um processo
-- manualmente — a remoção do botão "Novo Processo" na interface
-- (CasesManager.tsx) sozinha não garantiria isso.

DROP POLICY IF EXISTS "Users can create their own cases" ON public.cases;

COMMENT ON TABLE public.cases IS 'Processos. Criação exclusivamente automática via integrações JusBrasil (service role) — não há mais política de INSERT para o usuário autenticado (ver migration 20260905030000_remove_manual_case_creation.sql). Leitura, atualização e exclusão pelo dono continuam permitidas.';
