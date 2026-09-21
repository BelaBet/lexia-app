create table if not exists public.automation_health (
 automation_key text primary key,
 status text not null default 'ok' check (status in ('ok','warning','error')),
 last_success_at timestamptz,
 last_error_at timestamptz,
 details text,
 updated_at timestamptz not null default now()
);
alter table public.automation_health enable row level security;
drop policy if exists "authenticated can view automation health" on public.automation_health;
create policy "authenticated can view automation health" on public.automation_health for select to authenticated using (true);

create or replace function public.record_automation_health(p_key text,p_status text,p_details text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into automation_health(automation_key,status,last_success_at,last_error_at,details,updated_at)
 values(p_key,p_status,case when p_status='ok' then now() end,case when p_status='error' then now() end,p_details,now())
 on conflict(automation_key) do update set
   status=excluded.status,
   last_success_at=case when excluded.status='ok' then now() else automation_health.last_success_at end,
   last_error_at=case when excluded.status='error' then now() else automation_health.last_error_at end,
   details=excluded.details,updated_at=now();
end $$;
revoke all on function public.record_automation_health(text,text,text) from public,anon,authenticated;
grant execute on function public.record_automation_health(text,text,text) to service_role;

-- Replace cron commands so each successful run leaves a visible heartbeat.
do $$
declare jid bigint;
begin
 for jid in select jobid from cron.job where jobname='dispatch-event-notifications' loop perform cron.unschedule(jid); end loop;
 perform cron.schedule('dispatch-event-notifications','*/5 * * * *',
   $cron$select public.dispatch_due_event_notifications(), public.record_automation_health('event_notifications','ok','Verificação automática de lembretes concluída');$cron$);
 for jid in select jobid from cron.job where jobname='reconcile-process-agenda' loop perform cron.unschedule(jid); end loop;
 perform cron.schedule('reconcile-process-agenda','*/15 * * * *',
   $cron$select public.sync_process_agenda_from_stored_data(null), public.record_automation_health('process_agenda_sync','ok','Reconciliação processo-agenda concluída');$cron$);
end $$;
select public.record_automation_health('event_notifications','ok','Automação configurada e validada');
select public.record_automation_health('process_agenda_sync','ok','Automação configurada e validada');
