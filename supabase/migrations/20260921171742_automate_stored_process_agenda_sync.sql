create or replace function public.sync_process_agenda_from_stored_data(p_result_id uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count int:=0; r record; a jsonb; dt_text text; loc text; typ text; ts timestamp; sk text; eid uuid; is_cancelled boolean;
begin
 for r in select * from process_search_results where case_id is not null and (p_result_id is null or id=p_result_id)
 loop
   for a in select value from jsonb_array_elements(coalesce(r.raw_data->'audiencias','[]'::jsonb))
   loop
     if jsonb_typeof(a)='array' then dt_text:=a->>0; loc:=coalesce(a->>1,''); typ:=coalesce(a->>2,'Audiência');
     else dt_text:=coalesce(a->>'datahora',a->>'data_hora'); loc:=coalesce(a->>'local',''); typ:=coalesce(a->>'tipo','Audiência'); end if;
     if dt_text is null or dt_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}' then continue; end if;
     ts:=dt_text::timestamp; sk:=md5(r.case_id::text||'|'||dt_text||'|'||loc||'|'||typ);
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
end $$;
revoke all on function public.sync_process_agenda_from_stored_data(uuid) from public,anon,authenticated;
grant execute on function public.sync_process_agenda_from_stored_data(uuid) to service_role;

create or replace function public.trg_sync_process_agenda()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.sync_process_agenda_from_stored_data(new.id);
 return new;
end $$;
drop trigger if exists trg_process_search_results_sync_agenda on public.process_search_results;
create trigger trg_process_search_results_sync_agenda
after insert or update of raw_data,case_id on public.process_search_results
for each row execute function public.trg_sync_process_agenda();

-- Safety reconciliation every 15 minutes, using DB data only.
do $$
declare jid bigint;
begin
 for jid in select jobid from cron.job where jobname='reconcile-process-agenda' loop perform cron.unschedule(jid); end loop;
 perform cron.schedule('reconcile-process-agenda','*/15 * * * *',$cron$select public.sync_process_agenda_from_stored_data(null);$cron$);
end $$;
select public.sync_process_agenda_from_stored_data(null);
