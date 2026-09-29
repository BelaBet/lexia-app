-- Keep a stable destination for new notifications. Old notices still open their section.
alter table public.notifications add column if not exists link_id uuid;
update public.notifications set link_tab = 'calendar' where link_tab = 'agenda';

create or replace function public.notify_event_created()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_value text;
  v_message text;
begin
  v_value := public.format_event_value(new.case_id);
  v_message := 'Data: '||to_char(new.event_date,'DD/MM/YYYY')||' às '||to_char(new.event_time,'HH24:MI');
  if new.location is not null and btrim(new.location)<>'' then
    v_message := v_message||' • Local: '||new.location;
  end if;
  if v_value is not null then
    v_message := v_message||' • Valor: R$ '||v_value;
  end if;
  insert into public.notifications(user_id,title,message,link_tab,link_id)
  values(new.user_id,'Novo evento na Agenda: '||new.title,v_message,'calendar',new.id);
  insert into public.event_notification_deliveries(event_id,user_id,scheduled_for,reminder_type)
  values(new.id,new.user_id,now(),'created')
  on conflict(event_id,scheduled_for) do nothing;
  return new;
end $$;

revoke all on function public.notify_event_created() from public, anon, authenticated;

create or replace function public.dispatch_due_event_notifications()
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  with base as (
    select e.*, ((e.event_date::timestamp+e.event_time) at time zone 'America/Recife') event_at
    from public.events e
    where e.notification_enabled is true
      and coalesce(e.status::text,'') not in ('completed','cancelled')
  ),
  cadence as (
    select b.id event_id,b.user_id,b.created_at + (g.n * interval '3 days') scheduled_for,
      'every_3_days'::text reminder_type
    from base b
    cross join lateral generate_series(
      1, greatest(0,floor(extract(epoch from ((b.event_at-interval '2 hours')-b.created_at))/259200)::int)
    ) g(n)
  ),
  final2h as (
    select b.id event_id,b.user_id,b.event_at-interval '2 hours' scheduled_for,
      'two_hours'::text reminder_type
    from base b where b.event_at-interval '2 hours' > b.created_at
  ),
  due as (select * from cadence union all select * from final2h),
  ins_delivery as (
    insert into public.event_notification_deliveries(event_id,user_id,scheduled_for,reminder_type)
    select d.event_id,d.user_id,d.scheduled_for,d.reminder_type
    from due d
    where d.scheduled_for <= now() and d.scheduled_for > now()-interval '10 minutes'
    on conflict(event_id,scheduled_for) do nothing
    returning event_id,user_id,scheduled_for,reminder_type
  )
  insert into public.notifications(user_id,title,message,link_tab,link_id)
  select d.user_id,
    case when d.reminder_type='two_hours' then 'Atenção: evento em 2 horas'
         else 'Lembrete de evento da Agenda' end,
    e.title||' • Data: '||to_char(e.event_date,'DD/MM/YYYY')||' às '||to_char(e.event_time,'HH24:MI')
      ||case when e.location is not null and btrim(e.location)<>'' then ' • Local: '||e.location else '' end
      ||case when public.format_event_value(e.case_id) is not null then ' • Valor: R$ '||public.format_event_value(e.case_id) else '' end,
    'calendar',e.id
  from ins_delivery d join public.events e on e.id=d.event_id;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;

revoke all on function public.dispatch_due_event_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_due_event_notifications() to service_role;

create or replace function public.notify_owner_on_client_document()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner_id uuid; v_case_title text;
begin
  if new.uploaded_by = 'client' then
    select user_id,title into v_owner_id,v_case_title from public.cases where id=new.case_id;
    if v_owner_id is not null then
      insert into public.notifications(user_id,title,message,link_tab,link_id)
      values(v_owner_id,'Cliente enviou um documento',coalesce(v_case_title,'Caso')||': '||new.file_name,'cases',new.case_id);
    end if;
  end if;
  return new;
end $$;

revoke all on function public.notify_owner_on_client_document() from public, anon, authenticated;

create or replace function public.notify_owner_on_request_fulfilled()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner_id uuid;
begin
  if new.status = 'fulfilled' and old.status is distinct from 'fulfilled' then
    select user_id into v_owner_id from public.cases where id=new.case_id;
    if v_owner_id is not null then
      insert into public.notifications(user_id,title,message,link_tab,link_id)
      values(v_owner_id,'Cliente respondeu uma solicitação',new.title,'cases',new.case_id);
    end if;
  end if;
  return new;
end $$;

revoke all on function public.notify_owner_on_request_fulfilled() from public, anon, authenticated;
