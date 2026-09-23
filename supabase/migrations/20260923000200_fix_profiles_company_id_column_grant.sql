-- A migration anterior (20260923000100) tentou bloquear
-- `company_id` com `revoke update (company_id) on public.profiles from
-- authenticated`, mas isso não teve efeito nenhum: `authenticated` já
-- tinha UPDATE de TABELA inteira (grant do schema padrão do Supabase), e
-- no Postgres um grant de tabela cobre todas as colunas independente de
-- qualquer revoke de coluna específica — só dá pra restringir revogando
-- o UPDATE de tabela inteira e concedendo de volta coluna por coluna.
-- (Verificado em produção: has_column_privilege('authenticated',
-- 'public.profiles','company_id','UPDATE') continuava true depois do
-- revoke anterior.)
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, phone, oab_number, specialty)
  on public.profiles to authenticated;
