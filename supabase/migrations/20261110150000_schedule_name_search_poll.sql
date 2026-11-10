-- Até agora, uma busca por nome confirmada (process_search_reports em
-- "processando") só saía desse estado se alguém voltasse na tela e clicasse
-- em "Verificar resultado" (check-name-search) — o JusBrasil processa o
-- relatório completo de forma assíncrona e pode levar até 72h, então sem
-- isso o resultado pronto do lado deles podia ficar parado horas/dias sem
-- aparecer na LEXIA. Esta migration agenda uma verificação periódica
-- (poll-name-search, de hora em hora) que reaproveita a mesma lógica do
-- botão manual via _shared/checkNameSearchReport.ts.
--
-- Autenticação: mesmo segredo dedicado já criado para poll-jusbrasil/
-- sync-all-case-details (get_cron_dispatch_secret(), guardado no Vault) —
-- nenhum segredo novo é necessário.

do $$
declare jid bigint;
begin
  for jid in select jobid from cron.job where jobname = 'poll-name-search-hourly' loop
    perform cron.unschedule(jid);
  end loop;
  -- De hora em hora, minuto 15 (evita a mesma janela cheia das 11h/11h30 já
  -- usada por poll-jusbrasil-daily/sync-all-case-details-daily).
  perform cron.schedule(
    'poll-name-search-hourly',
    '15 * * * *',
    $cron$
    select net.http_post(
      url := 'https://dtpyeytvawomzkcihmsy.supabase.co/functions/v1/poll-name-search',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || public.get_cron_dispatch_secret(),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
end $$;
