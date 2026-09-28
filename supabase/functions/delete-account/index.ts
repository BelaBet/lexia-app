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
// user_roles/feature_requests/process_search_* (que têm "references
// auth.users(id) on delete cascade"). Este função apaga explicitamente as
// demais, na ordem que respeita as FKs sem "on delete cascade"/"on delete
// set null" (case_timeline_events/client_requests/client_documents
// referenciam cases.case_id sem cascade — precisam ser apagadas antes das
// próprias linhas de cases).
//
// Cobertura: as tabelas conhecidas na data desta correção. Se uma nova
// tabela de dados por usuário for adicionada depois, precisa entrar aqui
// também — não há como este função descobrir isso sozinha.
//
// CORRIGIDO (achado de segurança/privacidade): 1) checklist_templates,
// obligation_history, api_usage e legal_chat_requests tinham user_id
// próprio mas nunca eram apagadas — não têm FK para auth.users (cascade)
// nem eram cobertas aqui, então esses dados sobreviviam indefinidamente à
// exclusão da conta. 2) NENHUMA das chamadas .delete()/.update() abaixo
// verificava o {error} retornado — se qualquer uma falhasse silenciosamente
// (RLS, FK inesperada, erro de rede), a função ainda respondia
// {success:true}, dizendo ao usuário que a conta e os dados foram
// excluídos quando na verdade parte deles pode ter permanecido. Agora cada
// operação é registrada e, se alguma falhar, a função retorna erro (nunca
// sucesso) e NÃO prossegue para excluir o login — evita apagar o acesso do
// usuário enquanto ainda sobram dados órfãos vinculados ao user_id dele.

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

  const failures: string[] = [];
  const track = (label: string, error: { message: string } | null) => {
    if (error) {
      console.error(`Error during account deletion (${label}):`, error);
      failures.push(label);
    }
  };

  try {
    // 1) Processos do usuário (como advogado dono) — precisa apagar antes
    //    as linhas do portal do cliente que referenciam case_id sem
    //    "on delete cascade" (case_timeline_events, client_requests,
    //    client_documents), senão o delete de cases falha por FK.
    const { data: ownedCases, error: ownedCasesError } = await adminClient.from("cases").select("id").eq("user_id", userId);
    track("cases (leitura)", ownedCasesError);
    const caseIds = (ownedCases ?? []).map((c) => c.id as string);

    if (caseIds.length > 0) {
      const { data: clientDocs, error: clientDocsReadError } = await adminClient
        .from("client_documents")
        .select("file_path")
        .in("case_id", caseIds);
      track("client_documents (leitura)", clientDocsReadError);
      const paths = (clientDocs ?? []).map((d) => d.file_path as string);
      if (paths.length > 0) {
        const { error: removeError } = await adminClient.storage.from("client-documents").remove(paths);
        track("client-documents (storage)", removeError);
      }

      track("client_documents", (await adminClient.from("client_documents").delete().in("case_id", caseIds)).error);
      track("client_requests", (await adminClient.from("client_requests").delete().in("case_id", caseIds)).error);
      track("case_timeline_events", (await adminClient.from("case_timeline_events").delete().in("case_id", caseIds)).error);
    }

    // 2) Clientes cadastrados pelo usuário (como dono do escritório) —
    //    case_clients cascade automaticamente ao apagar clients/cases.
    track("clients (owner_id)", (await adminClient.from("clients").delete().eq("owner_id", userId)).error);
    // Se esta conta também é (ou já foi) um CLIENTE vinculado a outro
    // escritório, desvincula em vez de apagar a linha de `clients` (que
    // pertence ao escritório do outro advogado, não a este usuário).
    track("clients (user_id)", (await adminClient.from("clients").update({ user_id: null }).eq("user_id", userId)).error);

    track("cases", (await adminClient.from("cases").delete().eq("user_id", userId)).error);

    // 3) Anexos de eventos/publicações no Storage, antes de apagar as
    //    linhas (evita ficarem órfãos — mesma lição do BUG-10).
    const { data: pubAttachments, error: pubAttachmentsReadError } = await adminClient
      .from("publication_attachments")
      .select("file_path, publications!inner(user_id)")
      .eq("publications.user_id", userId);
    track("publication_attachments (leitura)", pubAttachmentsReadError);
    const pubPaths = (pubAttachments ?? []).map((a) => a.file_path as string);
    if (pubPaths.length > 0) {
      const { error: removeError } = await adminClient.storage.from("publication-attachments").remove(pubPaths);
      track("publication-attachments (storage)", removeError);
    }

    const { data: eventFiles, error: eventFilesReadError } = await adminClient.storage.from("event-files").list(userId);
    track("event-files (leitura)", eventFilesReadError);
    if (eventFiles && eventFiles.length > 0) {
      const { error: removeError } = await adminClient.storage
        .from("event-files")
        .remove(eventFiles.map((f) => `${userId}/${f.name}`));
      track("event-files (storage)", removeError);
    }

    // Autos processuais baixados via "Buscar Processos" (request-case-autos)
    // ficam em process-search-documents/{userId}/{resultId}/... — sem esta
    // limpeza, os arquivos ficavam órfãos no Storage após a exclusão da
    // conta (as linhas em process_search_documents somem via cascade, mas
    // os blobs no bucket não).
    const { data: autosFolders, error: autosFoldersReadError } = await adminClient.storage.from("process-search-documents").list(userId);
    track("process-search-documents (leitura)", autosFoldersReadError);
    if (autosFolders && autosFolders.length > 0) {
      const autosPaths: string[] = [];
      for (const folder of autosFolders) {
        const { data: files, error: filesReadError } = await adminClient.storage
          .from("process-search-documents")
          .list(`${userId}/${folder.name}`);
        track(`process-search-documents/${folder.name} (leitura)`, filesReadError);
        (files ?? []).forEach((f) => autosPaths.push(`${userId}/${folder.name}/${f.name}`));
      }
      if (autosPaths.length > 0) {
        const { error: removeError } = await adminClient.storage.from("process-search-documents").remove(autosPaths);
        track("process-search-documents (storage)", removeError);
      }
    }

    // 4) Tabelas com user_id direto — events/checklists/publications já
    //    fazem cascade dos próprios filhos (event_participants,
    //    event_attachments, checklist_items, publication_attachments,
    //    publication_followups) via "on delete cascade".
    track("events", (await adminClient.from("events").delete().eq("user_id", userId)).error);
    track("documents", (await adminClient.from("documents").delete().eq("user_id", userId)).error);
    track("document_shares", (await adminClient.from("document_shares").delete().or(`shared_by.eq.${userId},shared_with.eq.${userId}`)).error);
    track("checklists", (await adminClient.from("checklists").delete().eq("user_id", userId)).error);
    // checklist_templates.user_id não tem FK/cascade para auth.users nem
    // para checklists — ficava para sempre no banco após a exclusão da
    // conta. checklist_template_items cascade a partir daqui; checklists
    // que referenciam um template apagado só perdem o vínculo (SET NULL),
    // então a ordem não importa.
    track("checklist_templates", (await adminClient.from("checklist_templates").delete().eq("user_id", userId)).error);
    track("publications", (await adminClient.from("publications").delete().eq("user_id", userId)).error);
    track("publication_integrations", (await adminClient.from("publication_integrations").delete().eq("user_id", userId)).error);
    track("notifications", (await adminClient.from("notifications").delete().eq("user_id", userId)).error);
    track("process_search_charges", (await adminClient.from("process_search_charges").delete().eq("user_id", userId)).error);
    track("process_search_reports", (await adminClient.from("process_search_reports").delete().eq("user_id", userId)).error);
    track("agenda_blocked_dates", (await adminClient.from("agenda_blocked_dates").delete().eq("user_id", userId)).error);
    track("clickup_integrations", (await adminClient.from("clickup_integrations").delete().eq("user_id", userId)).error);
    track("chat_history", (await adminClient.from("chat_history").delete().eq("user_id", userId)).error);
    track("user_settings", (await adminClient.from("user_settings").delete().eq("user_id", userId)).error);
    // obligation_history/api_usage/legal_chat_requests: mesmo achado de
    // checklist_templates — user_id próprio, sem FK/cascade, nunca eram
    // limpos (api_usage e legal_chat_requests são apenas contadores de
    // rate-limit, mas ainda são dados pessoais que devem ser removidos).
    track("obligation_history", (await adminClient.from("obligation_history").delete().eq("user_id", userId)).error);
    track("api_usage", (await adminClient.from("api_usage").delete().eq("user_id", userId)).error);
    track("legal_chat_requests", (await adminClient.from("legal_chat_requests").delete().eq("user_id", userId)).error);

    if (failures.length > 0) {
      console.error("Account deletion incomplete, aborting before removing auth user. Failed steps:", failures.join(", "));
      return json({
        error: "Não foi possível remover todos os dados da conta. Nada foi excluído do seu login — tente novamente ou contate o suporte.",
        failed_steps: failures,
      }, 500);
    }

    // 5) Por fim, a conta em si — profiles/user_roles/feature_requests/
    //    process_search_* têm "references auth.users(id) on delete
    //    cascade" e somem sozinhos. Só chega aqui se todas as etapas acima
    //    tiverem sucesso confirmado.
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
