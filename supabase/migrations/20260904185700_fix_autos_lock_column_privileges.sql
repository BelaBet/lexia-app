-- Fecha uma lacuna deixada pela migração anterior
-- (name_search_autos_download_lock): as colunas de estado do download
-- (autos_status, autos_requested_at, autos_ready_at, autos_error) também
-- só devem ser alteradas pelas edge functions (service role) — do
-- contrário, um usuário autenticado poderia bater direto na tabela e, por
-- exemplo, marcar autos_status como 'pronto' sem passar por
-- request-case-autos, ou apagar autos_error para esconder uma falha.

REVOKE UPDATE (
  autos_status,
  autos_requested_at,
  autos_ready_at,
  autos_error
) ON public.process_search_results FROM authenticated, anon;
