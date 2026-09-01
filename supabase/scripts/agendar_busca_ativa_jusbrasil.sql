-- Agenda a busca ativa diária no JusBrasil (chama a edge function
-- poll-jusbrasil). Rode este script MANUALMENTE, uma única vez, no SQL
-- Editor do Supabase (https://supabase.com/dashboard -> seu projeto -> SQL
-- Editor), DEPOIS de já ter aplicado as migrations e feito o deploy da
-- função poll-jusbrasil.
--
-- Antes de rodar, troque SUA_SERVICE_ROLE_KEY_AQUI (linha marcada abaixo)
-- pela Service Role Key do seu projeto (Project Settings -> API -> service
-- role secret). Ela fica guardada de forma criptografada no Vault do
-- Supabase, não em texto puro numa tabela.

-- 1) Guarda a Service Role Key de forma segura no Vault (rode só uma vez;
--    se já existir, apague a linha antiga antes com:
--    select vault.delete_secret((select id from vault.secrets where name = 'service_role_key_poll'));)
select vault.create_secret(
  'SUA_SERVICE_ROLE_KEY_AQUI', -- <<< troque aqui
  'service_role_key_poll',
  'Service role key usada só para o agendamento da busca ativa de publicações'
);

-- 2) Agenda a execução diária às 08:00 (horário de Brasília = 11:00 UTC).
--    Ajuste o horário no campo cron (minuto hora * * *) se quiser outro.
select cron.schedule(
  'poll-jusbrasil-daily',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://dtpyeytvawomzkcihmsy.supabase.co/functions/v1/poll-jusbrasil',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key_poll'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para conferir se ficou agendado:
-- select * from cron.job;

-- Para rodar uma vez agora mesmo, sem esperar o horário (teste manual):
-- select net.http_post(
--   url := 'https://dtpyeytvawomzkcihmsy.supabase.co/functions/v1/poll-jusbrasil',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key_poll'),
--     'Content-Type', 'application/json'
--   ),
--   body := '{}'::jsonb
-- );

-- Para desativar a busca ativa agendada:
-- select cron.unschedule('poll-jusbrasil-daily');
