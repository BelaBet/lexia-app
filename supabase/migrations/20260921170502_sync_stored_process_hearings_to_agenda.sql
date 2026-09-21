create table if not exists public.case_agenda_sync_keys(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 case_id uuid not null references public.cases(id) on delete cascade,
 source text not null,
 source_key text not null unique,
 created_at timestamptz not null default now()
);
alter table public.case_agenda_sync_keys enable row level security;
create index if not exists idx_case_agenda_sync_keys_case on public.case_agenda_sync_keys(case_id);

with raw_hearings as (
 select r.case_id,r.user_id,r.process_number,
   jsonb_array_elements(coalesce(r.raw_data->'audiencias','[]'::jsonb)) aud
 from public.process_search_results r
 where r.case_id is not null and jsonb_typeof(coalesce(r.raw_data->'audiencias','[]'::jsonb))='array'
), n as (
 select *,
   case when jsonb_typeof(aud)='array' then aud->>0 else coalesce(aud->>'datahora',aud->>'data_hora') end dt,
   case when jsonb_typeof(aud)='array' then coalesce(aud->>1,'') else coalesce(aud->>'local','') end loc,
   case when jsonb_typeof(aud)='array' then coalesce(aud->>2,'Audiência') else coalesce(aud->>'tipo','Audiência') end typ
 from raw_hearings
), valid as (
 select *, dt::timestamp as ts,
   md5(case_id::text||'|'||dt||'|'||loc||'|'||typ) skey
 from n
 where dt ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}'
   and dt::timestamp::date >= current_date
), ins as (
 insert into public.events(user_id,title,description,event_date,event_time,type,location,case_id,
   notification_enabled,notification_minutes_before,status,priority)
 select v.user_id,
   'Audiência — '||v.process_number,
   'Audiência importada dos dados processuais já armazenados na TK2 Juris. Tipo: '||v.typ,
   v.ts::date,v.ts::time,'hearing',nullif(v.loc,''),v.case_id,
   true,30,'pending','high'
 from valid v
 where not exists(select 1 from public.case_agenda_sync_keys k where k.source_key=v.skey)
   and not exists(select 1 from public.events e where e.case_id=v.case_id and e.type='hearing' and e.event_date=v.ts::date and e.event_time=v.ts::time)
 returning id,case_id,event_date,event_time
)
insert into public.case_agenda_sync_keys(event_id,case_id,source,source_key)
select i.id,i.case_id,'stored_process_hearing',
 md5(i.case_id::text||'|'||to_char(i.event_date,'YYYY-MM-DD')||' '||to_char(i.event_time,'HH24:MI:SS')||'|'||
      coalesce((select e.location from public.events e where e.id=i.id),'')||'|'||
      coalesce((select regexp_replace(e.description,'^.*Tipo: ','') from public.events e where e.id=i.id),'Audiência'))
from ins i
on conflict(source_key) do nothing;
