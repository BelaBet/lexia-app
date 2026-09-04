// "Baixar autos" de um processo encontrado na busca por nome. Baixa os
// documentos/peças do JusBrasil e guarda no Storage (bucket privado
// process-search-documents).
//
// TRAVA DE DOWNLOAD: um processo só pode ter os autos baixados UMA vez por
// um usuário comum. Depois disso, autos_download_locked fica true e
// qualquer nova tentativa é bloqueada aqui (mesmo que o botão apareça de
// novo na tela por algum motivo) — só a função admin-unlock-autos-download,
// chamada por um admin/supremo, consegue destravar. As colunas de trava só
// podem ser alteradas pela service role (ver migração
// name_search_autos_download_lock), então mesmo um usuário tentando bater
// direto na tabela não consegue burlar isso.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { fetchCaseAutos } from "../_shared/jusbrasilNameSearch.ts";

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

  let body: { result_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const resultId = body.result_id;
  if (!resultId) return json({ error: "result_id é obrigatório" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: result, error: resultError } = await adminClient
    .from("process_search_results")
    .select("id, user_id, process_number, autos_download_locked, autos_status, report_id")
    .eq("id", resultId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (resultError) {
    console.error("Error loading search result:", resultError);
    return json({ error: "Erro ao carregar processo" }, 500);
  }
  if (!result) return json({ error: "Processo não encontrado" }, 404);
  if (!result.process_number) return json({ error: "Processo sem número CNJ identificado — não é possível baixar os autos" }, 400);

  if (result.autos_download_locked) {
    return json({
      error: "Os autos deste processo já foram baixados. Um novo download só pode ser liberado por um administrador.",
      locked: true,
    }, 403);
  }

  const { data: report } = await adminClient
    .from("process_search_reports")
    .select("integration_id")
    .eq("id", result.report_id)
    .maybeSingle();

  const { data: integration } = await adminClient
    .from("publication_integrations")
    .select("id, api_key")
    .eq("id", report?.integration_id)
    .maybeSingle();

  if (!integration?.api_key) return json({ error: "Integração JusBrasil não encontrada ou sem chave" }, 400);

  await adminClient
    .from("process_search_results")
    .update({ autos_status: "solicitado", autos_requested_at: new Date().toISOString() })
    .eq("id", resultId);

  try {
    const documents = await fetchCaseAutos(integration.api_key, result.process_number);
    if (documents.length === 0) {
      await adminClient
        .from("process_search_results")
        .update({ autos_status: "erro", autos_error: "Nenhum documento disponível para este processo (pode estar em segredo de justiça ou o tribunal não suportar consulta de anexos)." })
        .eq("id", resultId);
      return json({ error: "Nenhum documento disponível para este processo." }, 502);
    }

    let saved = 0;
    for (const doc of documents) {
      try {
        const fileResponse = await fetch(doc.url);
        if (!fileResponse.ok) continue;
        const blob = await fileResponse.blob();
        const filePath = `${user.id}/${resultId}/${Date.now()}_${doc.nome}`;
        const { error: uploadError } = await adminClient.storage
          .from("process-search-documents")
          .upload(filePath, blob, { contentType: doc.tipo || "application/pdf" });
        if (uploadError) {
          console.error("Error uploading autos document:", uploadError);
          continue;
        }
        await adminClient.from("process_search_documents").insert({
          result_id: resultId,
          user_id: user.id,
          file_name: doc.nome,
          file_path: filePath,
          file_size: blob.size,
          file_type: doc.tipo || "application/pdf",
          source_url: doc.url,
        });
        saved += 1;
      } catch (docErr) {
        console.error("Error downloading individual autos document:", docErr);
      }
    }

    await adminClient
      .from("process_search_results")
      .update({
        autos_status: saved > 0 ? "pronto" : "erro",
        autos_download_locked: true,
        autos_downloaded_at: new Date().toISOString(),
        autos_error: saved > 0 ? null : "Falha ao baixar os documentos retornados pelo JusBrasil.",
      })
      .eq("id", resultId);

    await adminClient.from("process_search_charges").insert({
      user_id: user.id,
      integration_id: integration.id,
      source: "jusbrasil",
      document: result.process_number,
      document_type: "nome",
      search_type: "autos",
      unit_price: 0,
      charged_amount: 0,
    });

    return json({ success: saved > 0, documents_saved: saved, locked: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error fetching case autos:", message);
    await adminClient
      .from("process_search_results")
      .update({ autos_status: "erro", autos_error: message.slice(0, 500) })
      .eq("id", resultId);
    return json({ error: `Erro ao buscar autos no JusBrasil: ${message}`, locked: false }, 502);
  }
});
