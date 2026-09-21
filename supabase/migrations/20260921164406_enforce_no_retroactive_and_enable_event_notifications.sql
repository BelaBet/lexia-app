-- Manual users, including admin/supremo, can never create/move events into the past.
-- service_role remains allowed only for external integrations importing historical facts.
create or replace function public.prevent_retroactive_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.event_date < current_date
   and coalesce(auth.role(),'') <> 'service_role'
   and (tg_op='INSERT' or new.event_date is distinct from old.event_date)
 then raise exception 'Não é possível criar ou mover eventos para datas passadas.' using errcode='23514';
 end if;
 return new;
end $$;

create table if not exists public.event_notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 scheduled_for timestamptz not null,
 delivered_at timestamptz not null default now(),
 unique(event_id, scheduled_for)
);
alter table public.event_notification_deliveries enable row level security;
create index if not exists idx_event_notification_deliveries_user on public.event_notification_deliveries(user_id, delivered_at desc);

create or replace function public.dispatch_due_event_notifications()
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
 with due as (
   select e.id event_id,e.user_id,e.title,e.event_date,e.event_time,
     ((e.event_date::timestamp + e.event_time) at time zone 'America/Recife'
       - make_interval(mins=>greatest(coalesce(e.notification_minutes_before,30),0))) scheduled_for
   from public.events e
   where e.notification_enabled is true
     and coalesce(e.status::text,'') not in ('completed','cancelled')
 ), ins_delivery as (
   insert into public.event_notification_deliveries(event_id,user_id,scheduled_for)
   select event_id,user_id,scheduled_for from due
   where scheduled_for <= now() and scheduled_for > now()-interval '10 minutes'
   on conflict(event_id,scheduled_for) do nothing
   returning event_id,user_id,scheduled_for
 )
 insert into public.notifications(user_id,title,message,link_tab)
 select d.user_id,'Lembrete de agenda',
        e.title || ' — ' || to_char(e.event_date,'DD/MM/YYYY') || ' às ' || to_char(e.event_time,'HH24:MI'),
        'agenda'
 from ins_delivery d join public.events e on e.id=d.event_id;
 get diagnostics inserted_count = row_count;
 return inserted_count;
end $$;
revoke all on function public.dispatch_due_event_notifications() from public,anon,authenticated;
grant execute on function public.dispatch_due_event_notifications() to service_role;

do $$
declare jid bigint;
begin
 for jid in select jobid from cron.job where jobname='dispatch-event-notifications' loop
   perform cron.unschedule(jid);
 end loop;
 perform cron.schedule('dispatch-event-notifications','*/5 * * * *',$cron$select public.dispatch_due_event_notifications();$cron$);
end $$;
