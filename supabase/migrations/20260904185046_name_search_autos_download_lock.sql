-- Trava de download dos autos processuais: um processo encontrado na busca
-- por nome só pode ter os autos baixados UMA vez por um usuário comum —
-- depois disso, um novo download só pode ser liberado por um admin/supremo
-- (edge function admin-unlock-autos-download).
--
-- As colunas abaixo (estado da trava + auditoria de quem liberou) só podem
-- ser alteradas pela service role: revogamos UPDATE nelas para
-- authenticated/anon, então mesmo um usuário autenticado batendo direto na
-- tabela (fora das edge functions) não consegue se auto-liberar.

ALTER TABLE public.process_search_results
  ADD COLUMN IF NOT EXISTS autos_download_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autos_downloaded_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS autos_unlocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autos_unlocked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS autos_unlock_reason TEXT;

REVOKE UPDATE (
  autos_download_locked,
  autos_downloaded_at,
  autos_unlocked_by,
  autos_unlocked_at,
  autos_unlock_reason
) ON public.process_search_results FROM authenticated, anon;
