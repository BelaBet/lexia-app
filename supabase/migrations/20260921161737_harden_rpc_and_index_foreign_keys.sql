-- Harden privileged RPC. Only authenticated admins may change roles.
create or replace function public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;
  delete from public.user_roles where user_id = p_target_user_id;
  insert into public.user_roles (user_id, role) values (p_target_user_id, p_new_role);
end;
$$;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated, service_role;

-- Functions that must never be directly callable anonymously.
revoke all on function public.delete_demo_data() from public, anon;
grant execute on function public.delete_demo_data() to authenticated, service_role;
revoke all on function public.is_case_client(uuid) from public, anon;
revoke all on function public.is_case_owner(uuid) from public, anon;
revoke all on function public.is_publication_owner(uuid) from public, anon;
grant execute on function public.is_case_client(uuid) to authenticated, service_role;
grant execute on function public.is_case_owner(uuid) to authenticated, service_role;
grant execute on function public.is_publication_owner(uuid) to authenticated, service_role;
revoke all on function public.mark_overdue_events() from public, anon, authenticated;
grant execute on function public.mark_overdue_events() to service_role;

-- Trigger functions are invoked by triggers, not client RPC calls.
revoke all on function public.enforce_client_request_fulfillment_only() from public, anon, authenticated;
revoke all on function public.notify_owner_on_client_document() from public, anon, authenticated;
revoke all on function public.notify_owner_on_request_fulfilled() from public, anon, authenticated;
revoke all on function public.prevent_delete_api_event() from public, anon, authenticated;
revoke all on function public.prevent_retroactive_event() from public, anon, authenticated;

-- Cover currently unindexed foreign keys.
create index if not exists idx_case_timeline_events_publication_id on public.case_timeline_events(publication_id);
create index if not exists idx_chat_history_document_id on public.chat_history(document_id);
create index if not exists idx_checklist_alerts_checklist_id on public.checklist_alerts(checklist_id);
create index if not exists idx_checklist_alerts_checklist_item_id on public.checklist_alerts(checklist_item_id);
create index if not exists idx_checklist_items_checklist_id on public.checklist_items(checklist_id);
create index if not exists idx_checklist_template_items_template_id on public.checklist_template_items(template_id);
create index if not exists idx_checklists_case_id on public.checklists(case_id);
create index if not exists idx_checklists_template_id on public.checklists(template_id);
create index if not exists idx_client_documents_request_id on public.client_documents(request_id);
create index if not exists idx_event_attachments_event_id on public.event_attachments(event_id);
create index if not exists idx_event_participants_event_id on public.event_participants(event_id);
create index if not exists idx_feature_requests_user_id on public.feature_requests(user_id);
create index if not exists idx_jusbrasil_usage_company_id on public.jusbrasil_usage(company_id);
create index if not exists idx_jusbrasil_usage_service_id on public.jusbrasil_usage(service_id);
create index if not exists idx_jusbrasil_usage_user_id on public.jusbrasil_usage(user_id);
create index if not exists idx_obligation_history_checklist_id on public.obligation_history(checklist_id);
create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_publication_attachments_publication_id on public.publication_attachments(publication_id);
create index if not exists idx_publication_integrations_linked_client_id on public.publication_integrations(linked_client_id);
