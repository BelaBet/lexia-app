-- "Todo processo tem que fazer buscas diárias": até agora não existia
-- NENHUM agendamento automático rodando (nem pg_cron, nem Vercel Cron, nem
-- GitHub Actions) — poll-jusbrasil (busca ativa por nome/OAB, já
-- codificada) só disparava quando alguém clicava "Buscar agora" na tela de
-- Integrações; havia até um script pronto pra agendar isso
-- (supabase/scripts/agendar_busca_ativa_jusbrasil.sql) que nunca foi
-- executado. Esta migration liga os dois jobs diários que faltavam:
--
--   1) poll-jusbrasil-daily: busca ativa por nome/OAB — processos NOVOS.
--   2) sync-all-case-details-daily: atualiza movimentações/autos dos
--      processos JÁ cadastrados (mesma lógica do botão "Sincronizar
--      detalhes"), pra não depender de alguém abrir a tela do processo.
--
-- Autenticação: em vez de guardar a Service Role Key em texto (que exigiria
-- alguém colar manualmente no SQL Editor, como o script antigo pedia),
-- gera-se aqui um segredo aleatório dedicado só pra essas duas chamadas
-- pg_cron -> edge function, guardado criptografado no Vault. As edge
-- functions passam a validar contra esse segredo (get_cron_dispatch_secret)
-- em vez da Service Role Key direta.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_dispatch_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_dispatch_secret',
      'Autoriza só o pg_cron a chamar poll-jusbrasil e sync-all-case-details — nunca exposto ao frontend.'
    );
  end if;
end $$;

create or replace function public.get_cron_dispatch_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_dispatch_secret'
$$;

revoke all on function public.get_cron_dispatch_secret() from public, anon, authenticated;
grant execute on function public.get_cron_dispatch_secret() to service_role;

do $$
declare jid bigint;
begin
  for jid in select jobid from cron.job where jobname = 'poll-jusbrasil-daily' loop
    perform cron.unschedule(jid);
  end loop;
  -- 08:00 horário de Brasília.
  perform cron.schedule(
    'poll-jusbrasil-daily',
    '0 11 * * *',
    $cron$
    select net.http_post(
      url := 'https://dtpyeytvawomzkcihmsy.supabase.co/functions/v1/poll-jusbrasil',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || public.get_cron_dispatch_secret(),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );

  for jid in select jobid from cron.job where jobname = 'sync-all-case-details-daily' loop
    perform cron.unschedule(jid);
  end loop;
  -- 08:30 horário de Brasília — depois da busca ativa acima, pra já
  -- alcançar processos novos importados nela no mesmo dia.
  perform cron.schedule(
    'sync-all-case-details-daily',
    '30 11 * * *',
    $cron$
    select net.http_post(
      url := 'https://dtpyeytvawomzkcihmsy.supabase.co/functions/v1/sync-all-case-details',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || public.get_cron_dispatch_secret(),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
end $$;
