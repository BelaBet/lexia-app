-- Expõe o token central do JusBrasil SOMENTE ao service_role para uso das
-- Edge Functions. O token continua armazenado no Supabase Vault.

create or replace function public.get_jusbrasil_api_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'JUSBRASIL_API_TOKEN'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_jusbrasil_api_token() from public;
revoke all on function public.get_jusbrasil_api_token() from anon;
revoke all on function public.get_jusbrasil_api_token() from authenticated;
grant execute on function public.get_jusbrasil_api_token() to service_role;
