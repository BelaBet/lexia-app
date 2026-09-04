// "Verificar resultado" — chamado pela tela do CRM para tentar buscar o
// export do relatório no JusBrasil. Se ainda não estiver pronto, apenas
// informa que precisa aguardar (a busca pode levar até 72h). Quando pronto,
// importa cada processo como um card novo em process_search_results
// (status inicial "novo" no Kanban) e marca o relatório como concluído.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { fetchNameSearchExport } from "../_shared/jusbrasilNameSearch.ts";

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

  let body: { report_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const reportId = body.report_id;
  if (!reportId) return json({ error: "report_id é obrigatório" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: report, error: reportError } = await adminClient
    .from("process_search_reports")
    .select("id, user_id, jusbrasil_report_id, status, integration_id")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (reportError) {
    console.error("Error loading report:", reportError);
    return json({ error: "Erro ao carregar busca" }, 500);
  }
  if (!report) return json({ error: "Busca não encontrada" }, 404);
  if (report.status === "concluido") return json({ success: true, status: "concluido", already_done: true });
  if (!report.jusbrasil_report_id) return json({ error: "Busca ainda não foi iniciada corretamente" }, 400);

  const { data: integration } = await adminClient
    .from("publication_integrations")
    .select("api_key")
    .eq("id", report.integration_id)
    .maybeSingle();

  if (!integration?.api_key) return json({ error: "Integração JusBrasil não encontrada ou sem chave" }, 400);

  try {
    const rows = await fetchNameSearchExport(integration.api_key, report.jusbrasil_report_id);
    if (rows === null) {
      return json({ success: true, status: "processando", message: "Ainda processando no JusBrasil. Pode levar até 72 horas — tente novamente mais tarde." });
    }

    let imported = 0;
    for (const row of rows) {
      const { error: upsertError } = await adminClient
        .from("process_search_results")
        .upsert(
          {
            report_id: report.id,
            user_id: user.id,
            ...row,
          },
          { onConflict: "report_id,process_number" },
        );
      if (upsertError) {
        console.error("Error upserting search result row:", upsertError);
        continue;
      }
      imported += 1;
    }

    await adminClient
      .from("process_search_reports")
      .update({ status: "concluido", result_count: imported, completed_at: new Date().toISOString() })
      .eq("id", report.id);

    await adminClient.from("notifications").insert({
      user_id: user.id,
      title: "Busca por nome concluída",
      message: `${imported} processo(s) encontrado(s). Confira no CRM de busca.`,
      link_tab: "process-search",
    });

    return json({ success: true, status: "concluido", imported });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error checking name search export:", message);
    await adminClient
      .from("process_search_reports")
      .update({ status: "erro", error_message: message.slice(0, 500) })
      .eq("id", report.id);
    return json({ error: `Erro ao consultar resultado no JusBrasil: ${message}` }, 502);
  }
});
