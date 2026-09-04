-- Reforço defensivo do índice único criado em
-- 20260904170000_unique_case_number_por_usuario.sql (Casos/Processos não
-- duplicados por usuário + case_number).
--
-- A versão original ia direto para o CREATE UNIQUE INDEX, sem tratar
-- registros que já violassem essa regra — se algum ambiente (cópia/fork
-- deste banco) já tivesse dois Casos com o mesmo user_id + case_number
-- (ex.: cadastro manual duplicado antes do índice existir), a criação do
-- índice falharia e travaria a migração. Nesta base de produção não há
-- duplicados (o índice já foi criado com sucesso), mas esta migração se
-- protege sozinha: qualquer duplicidade é mesclada (mantendo o caso mais
-- antigo e revinculando publicações/eventos para ele) antes de garantir o
-- índice, tornando a migração segura para reaplicar em qualquer cópia/fork
-- deste banco.

do $$
declare
  dup record;
  keep_id uuid;
begin
  for dup in
    select user_id, case_number
    from public.cases
    where case_number is not null
    group by user_id, case_number
    having count(*) > 1
  loop
    -- Mantém o caso mais antigo (menor created_at) como o registro
    -- definitivo e revincula tudo o que apontava para os duplicados.
    select id into keep_id
    from public.cases
    where user_id = dup.user_id and case_number = dup.case_number
    order by created_at asc
    limit 1;

    update public.publications
      set case_id = keep_id
      where case_id in (
        select id from public.cases
        where user_id = dup.user_id and case_number = dup.case_number and id <> keep_id
      );

    update public.events
      set case_id = keep_id
      where case_id in (
        select id from public.cases
        where user_id = dup.user_id and case_number = dup.case_number and id <> keep_id
      );

    delete from public.cases
      where user_id = dup.user_id and case_number = dup.case_number and id <> keep_id;
  end loop;
end $$;

create unique index if not exists cases_user_id_case_number_key
on public.cases (user_id, case_number);
