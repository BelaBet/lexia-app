-- Agenda alerts: immediate in-app alert, recurring every 3 days, and final alert 2h before.
alter table public.event_notification_deliveries
  add column if not exists reminder_type text;

create or replace function public.format_event_value(p_case_id uuid)
returns text language sql stable set search_path=public as $$
  select case when v is null then null
    else to_char(v,'FM999G999G999G990D00')
  end
  from (
    select coalesce(
      (select c.valor_causa from public.cases c where c.id=p_case_id),
      (select r.valor from public.process_search_results r where r.case_id=p_case_id and r.valor is not null order by r.updated_at desc nulls last limit 1)
    ) v
  ) x
$$;

create or replace function public.prepare_event_alerts()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- All agenda occurrences have alerts enabled. Final alert is 2 hours before.
  new.notification_enabled := true;
  new.notification_minutes_before := 120;
  return new;
end $$;

drop trigger if exists trg_prepare_event_alerts on public.events;
create trigger trg_prepare_event_alerts
before insert or update of event_date,event_time,notification_enabled,notification_minutes_before
on public.events for each row execute function public.prepare_event_alerts();

create or replace function public.notify_event_created()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_value text;
  v_message text;
  v_when timestamptz;
begin
  v_value := public.format_event_value(new.case_id);
  v_when := ((new.event_date::timestamp + new.event_time) at time zone 'America/Recife');

  v_message := 'Data: '||to_char(new.event_date,'DD/MM/YYYY')||' às '||to_char(new.event_time,'HH24:MI');
  if new.location is not null and btrim(new.location)<>'' then
    v_message := v_message||' • Local: '||new.location;
  end if;
  if v_value is not null then
    v_message := v_message||' • Valor: R$ '||v_value;
  end if;

  insert into public.notifications(user_id,title,message,link_tab)
  values(new.user_id,'Novo evento na Agenda: '||new.title,v_message,'agenda');

  insert into public.event_notification_deliveries(event_id,user_id,scheduled_for,reminder_type)
  values(new.id,new.user_id,now(),'created')
  on conflict(event_id,scheduled_for) do nothing;

  return new;
end $$;

drop trigger if exists trg_notify_event_created on public.events;
create trigger trg_notify_event_created
after insert on public.events for each row execute function public.notify_event_created();

create or replace function public.dispatch_due_event_notifications()
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  with base as (
    select e.*,
      ((e.event_date::timestamp+e.event_time) at time zone 'America/Recife') event_at
    from public.events e
    where e.notification_enabled is true
      and coalesce(e.status::text,'') not in ('completed','cancelled')
  ),
  cadence as (
    select b.id event_id,b.user_id,b.title,b.event_date,b.event_time,b.location,b.case_id,
      (b.created_at + (g.n * interval '3 days')) scheduled_for,
      'every_3_days'::text reminder_type,
      b.event_at
    from base b
    cross join lateral generate_series(
      1,
      greatest(0,floor(extract(epoch from ((b.event_at-interval '2 hours')-b.created_at))/259200)::int)
    ) g(n)
  ),
  final2h as (
    select b.id event_id,b.user_id,b.title,b.event_date,b.event_time,b.location,b.case_id,
      b.event_at-interval '2 hours' scheduled_for,
      'two_hours'::text reminder_type,
      b.event_at
    from base b
    where b.event_at-interval '2 hours' > b.created_at
  ),
  due as (
    select * from cadence union all select * from final2h
  ),
  ins_delivery as (
    insert into public.event_notification_deliveries(event_id,user_id,scheduled_for,reminder_type)
    select d.event_id,d.user_id,d.scheduled_for,d.reminder_type
    from due d
    where d.scheduled_for <= now() and d.scheduled_for > now()-interval '10 minutes'
    on conflict(event_id,scheduled_for) do nothing
    returning event_id,user_id,scheduled_for,reminder_type
  )
  insert into public.notifications(user_id,title,message,link_tab)
  select d.user_id,
    case when d.reminder_type='two_hours' then 'Atenção: evento em 2 horas'
         else 'Lembrete de evento da Agenda' end,
    e.title||' • Data: '||to_char(e.event_date,'DD/MM/YYYY')||' às '||to_char(e.event_time,'HH24:MI')
      ||case when e.location is not null and btrim(e.location)<>'' then ' • Local: '||e.location else '' end
      ||case when public.format_event_value(e.case_id) is not null then ' • Valor: R$ '||public.format_event_value(e.case_id) else '' end,
    'agenda'
  from ins_delivery d join public.events e on e.id=d.event_id;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;

revoke all on function public.prepare_event_alerts() from public,anon,authenticated;
revoke all on function public.notify_event_created() from public,anon,authenticated;
revoke all on function public.dispatch_due_event_notifications() from public,anon,authenticated;
grant execute on function public.dispatch_due_event_notifications() to service_role;

-- Ensure notifications can be received as live banners while the app is open.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
