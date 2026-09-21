-- 1) Índice faltando: case_agenda_sync_keys.event_id tem FK para events(id)
-- ON DELETE CASCADE sem índice de suporte — toda exclusão de evento força
-- um seq scan nesta tabela para achar as chaves a cascatear.
create index if not exists idx_case_agenda_sync_keys_event on public.case_agenda_sync_keys (event_id);

-- 2) Causa raiz da redundância: sync_process_agenda_from_stored_data()
-- computava source_key a partir de dt_text/loc/typ (texto cru vindo do
-- raw_data da API) em vez da data/hora já normalizada. Quando o provedor
-- reformata esses textos entre uma sincronização e outra (mesma audiência,
-- texto ligeiramente diferente), o hash muda, a busca por source_key não
-- encontra a chave antiga, cai no fallback por (case_id, tipo, data, hora)
-- — que ainda acha o MESMO evento (por isso nunca duplicou evento) — mas
-- insere uma chave NOVA apontando pro mesmo event_id, e a antiga fica
-- órfã. Troca para um hash baseado só em (case_id, data, hora) já
-- normalizados, que são estáveis entre re-sincronizações.
create or replace function public.sync_process_agenda_from_stored_data(p_result_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int:=0; r record; a jsonb; dt_text text; loc text; typ text; ts timestamp; sk text; eid uuid; is_cancelled boolean;
begin
  for r in select * from process_search_results where case_id is not null and (p_result_id is null or id=p_result_id)
  loop
    for a in select value from jsonb_array_elements(coalesce(r.raw_data->'audiencias','[]'::jsonb))
    loop
      if jsonb_typeof(a)='array' then dt_text:=a->>0; loc:=coalesce(a->>1,''); typ:=coalesce(a->>2,'Audiência');
      else dt_text:=coalesce(a->>'datahora',a->>'data_hora'); loc:=coalesce(a->>'local',''); typ:=coalesce(a->>'tipo','Audiência'); end if;
      if dt_text is null or dt_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}' then continue; end if;
      ts:=dt_text::timestamp; sk:=md5(r.case_id::text||'|'||ts::date::text||'|'||ts::time::text);
      -- Determine cancellation from already-stored movements only.
      select exists(
        select 1 from jsonb_array_elements(coalesce(r.raw_data->'movs','[]'::jsonb)) m
        where lower(coalesce(m->>1,'')||' '||coalesce(m->>2,'')) like '%audiência%'
          and lower(coalesce(m->>1,'')||' '||coalesce(m->>2,'')) like '%cancelad%'
          and (coalesce(m->>2,'') like '%'||to_char(ts,'DD/MM/YYYY HH24:MI')||'%' or coalesce(m->>2,'') like '%'||to_char(ts,'DD/MM/YYYY')||'%')
      ) into is_cancelled;

      select event_id into eid from case_agenda_sync_keys where source_key=sk;
      if eid is null then
        select id into eid from events where case_id=r.case_id and type='hearing' and event_date=ts::date and event_time=ts::time limit 1;
      end if;

      if is_cancelled then
        if eid is not null then update events set status='cancelled' where id=eid and status::text not in ('completed','cancelled'); end if;
        continue;
      end if;
      if ts::date < current_date then continue; end if;

      if eid is null then
        insert into events(user_id,title,description,event_date,event_time,type,location,case_id,notification_enabled,notification_minutes_before,status,priority)
        values(r.user_id,'Audiência — '||r.process_number,'Audiência sincronizada automaticamente a partir dos dados processuais armazenados. Tipo: '||typ,ts::date,ts::time,'hearing',nullif(loc,''),r.case_id,true,30,'pending','high')
        returning id into eid;
        v_count:=v_count+1;
      else
        update events set title='Audiência — '||r.process_number,location=nullif(loc,''),notification_enabled=true,
          notification_minutes_before=coalesce(notification_minutes_before,30)
        where id=eid;
      end if;
      insert into case_agenda_sync_keys(event_id,case_id,source,source_key)
        values(eid,r.case_id,'stored_process_hearing',sk) on conflict(source_key) do nothing;
    end loop;
  end loop;
  return v_count;
end $function$;

-- 3) Saneamento dos dados existentes: colapsa as chaves redundantes
-- (mesmo event_id, source_key antigo baseado em texto cru) para uma única
-- linha por evento, já com o novo source_key estável — assim a próxima
-- sincronização bate direto na chave existente, sem inserir outra.
with canonical as (
  select k.id, k.event_id,
         md5(k.case_id::text || '|' || e.event_date::text || '|' || e.event_time::text) as new_key,
         row_number() over (partition by k.event_id order by k.created_at asc) as rn
  from public.case_agenda_sync_keys k
  join public.events e on e.id = k.event_id
  where k.source = 'stored_process_hearing'
)
delete from public.case_agenda_sync_keys k
using canonical c
where k.id = c.id and c.rn > 1;

with canonical as (
  select k.id,
         md5(k.case_id::text || '|' || e.event_date::text || '|' || e.event_time::text) as new_key
  from public.case_agenda_sync_keys k
  join public.events e on e.id = k.event_id
  where k.source = 'stored_process_hearing'
)
update public.case_agenda_sync_keys k
set source_key = c.new_key
from canonical c
where k.id = c.id and k.source_key <> c.new_key;
