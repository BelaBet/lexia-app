// BUG-06 (corrigido): "Excluir Conta" na tela de Configurações não tinha
// nenhuma ação associada — o botão existia, avisava que a ação era
// irreversível, mas não fazia nada.
//
// Só apaga os dados do PRÓPRIO usuário autenticado — nunca recebe um id de
// usuário no corpo da requisição, sempre usa o id extraído do JWT (mesma
// lição do achado em store_clickup_token: nunca confiar num id vindo do
// cliente para uma operação sensível).
//
// A maioria das tabelas de dados do usuário (cases, events, documents,
// checklists, publications, etc.) não tem FK para auth.users — por isso
// auth.admin.deleteUser() sozinho NÃO limpa essas linhas, só profiles/
// user_roles/feature_requests (que têm "references auth.users(id) on
// delete cascade"). Este função apaga explicitamente as demais, na ordem
// que respeita as FKs sem "on delete cascade"/"on delete set null"
// (case_timeline_events/client_requests/client_documents referenciam
// cases.case_id sem cascade — precisam ser apagadas antes das próprias
// linhas de cases).
//
// Cobertura: as tabelas conhecidas na data desta correção. Se uma nova
// tabela de dados por usuário for adicionada depois, precisa entrar aqui
// também — não há como este função descobrir isso sozinha.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  const userId = user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1) Processos do usuário (como advogado dono) — precisa apagar antes
    //    as linhas do portal do cliente que referenciam case_id sem
    //    "on delete cascade" (case_timeline_events, client_requests,
    //    client_documents), senão o delete de cases falha por FK.
    const { data: ownedCases } = await adminClient.from("cases").select("id").eq("user_id", userId);
    const caseIds = (ownedCases ?? []).map((c) => c.id as string);

    if (caseIds.length > 0) {
      const { data: clientDocs } = await adminClient
        .from("client_documents")
        .select("file_path")
        .in("case_id", caseIds);
      const paths = (clientDocs ?? []).map((d) => d.file_path as string);
      if (paths.length > 0) {
        await adminClient.storage.from("client-documents").remove(paths).catch(() => {});
      }

      await adminClient.from("client_documents").delete().in("case_id", caseIds);
      await adminClient.from("client_requests").delete().in("case_id", caseIds);
      await adminClient.from("case_timeline_events").delete().in("case_id", caseIds);
    }

    // 2) Clientes cadastrados pelo usuário (como dono do escritório) —
    //    case_clients cascade automaticamente ao apagar clients/cases.
    await adminClient.from("clients").delete().eq("owner_id", userId);
    // Se esta conta também é (ou já foi) um CLIENTE vinculado a outro
    // escritório, desvincula em vez de apagar a linha de `clients` (que
    // pertence ao escritório do outro advogado, não a este usuário).
    await adminClient.from("clients").update({ user_id: null }).eq("user_id", userId);

    await adminClient.from("cases").delete().eq("user_id", userId);

    // 3) Anexos de eventos/publicações no Storage, antes de apagar as
    //    linhas (evita ficarem órfãos — mesma lição do BUG-10).
    const { data: pubAttachments } = await adminClient
      .from("publication_attachments")
      .select("file_path, publications!inner(user_id)")
      .eq("publications.user_id", userId);
    const pubPaths = (pubAttachments ?? []).map((a) => a.file_path as string);
    if (pubPaths.length > 0) {
      await adminClient.storage.from("publication-attachments").remove(pubPaths).catch(() => {});
    }

    const { data: eventFiles } = await adminClient.storage.from("event-files").list(userId);
    if (eventFiles && eventFiles.length > 0) {
      await adminClient.storage.from("event-files").remove(eventFiles.map((f) => `${userId}/${f.name}`)).catch(() => {});
    }

    // 4) Tabelas com user_id direto — events/checklists/publications já
    //    fazem cascade dos próprios filhos (event_participants,
    //    event_attachments, checklist_items, publication_attachments,
    //    publication_followups) via "on delete cascade".
    await adminClient.from("events").delete().eq("user_id", userId);
    await adminClient.from("documents").delete().eq("user_id", userId);
    await adminClient.from("document_shares").delete().or(`shared_by.eq.${userId},shared_with.eq.${userId}`);
    await adminClient.from("checklists").delete().eq("user_id", userId);
    await adminClient.from("publications").delete().eq("user_id", userId);
    await adminClient.from("publication_integrations").delete().eq("user_id", userId);
    await adminClient.from("notifications").delete().eq("user_id", userId);
    await adminClient.from("process_search_charges").delete().eq("user_id", userId);
    await adminClient.from("process_search_reports").delete().eq("user_id", userId);
    await adminClient.from("agenda_blocked_dates").delete().eq("user_id", userId);
    await adminClient.from("clickup_integrations").delete().eq("user_id", userId);
    await adminClient.from("chat_history").delete().eq("user_id", userId);
    await adminClient.from("user_settings").delete().eq("user_id", userId);

    // 5) Por fim, a conta em si — profiles/user_roles/feature_requests têm
    //    "references auth.users(id) on delete cascade" e somem sozinhos.
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error("Error deleting auth user after data cleanup:", deleteUserError);
      return json({ error: "Dados removidos, mas houve um erro ao excluir a conta. Contate o suporte." }, 500);
    }

    return json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error deleting account:", message);
    return json({ error: `Erro ao excluir a conta: ${message}` }, 500);
  }
});
