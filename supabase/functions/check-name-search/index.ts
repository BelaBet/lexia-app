// Verifica resultado de busca por nome no JusBrasil usando a credencial central da LEXIA.
// Primeiro consulta a definição do relatório e só tenta exportar após finished_at.
// Quando o relatório conclui, cada processo encontrado também é criado/atualizado
// em `cases`, para aparecer automaticamente no menu Processos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { fetchNameSearchExport } from "../_shared/jusbrasilNameSearch.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";

const JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br";

function hasFinishedAt(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const finishedAt = (payload as Record<string, unknown>).finished_at;
  if (finishedAt == null) return false;
  if (typeof finishedAt === "string") return finishedAt.trim().length > 0;
  if (typeof finishedAt === "number") return Number.isFinite(finishedAt) && finishedAt > 0;
  if (typeof finishedAt === "object") {
    const dateValue = (finishedAt as Record<string, unknown>)["$date"];
    return dateValue !== null && dateValue !== undefined;
  }
  return true;
}

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
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const reportId = body.report_id;
  if (!reportId) return json({ error: "report_id é obrigatório" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: report, error: reportError } = await adminClient
    .from("process_search_reports")
    .select("id, user_id, jusbrasil_report_id, status, integration_id, search_name")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (reportError) return json({ error: "Erro ao carregar busca" }, 500);
  if (!report) return json({ error: "Busca não encontrada" }, 404);
  if (report.status === "concluido") return json({ success: true, status: "concluido", already_done: true });
  if (!report.jusbrasil_report_id) return json({ error: "Busca ainda não foi iniciada corretamente" }, 400);

  let apiToken: string;
  try { apiToken = await getJusbrasilApiToken(adminClient); }
  catch { return json({ error: "Integração JusBrasil não configurada no backend" }, 500); }

  try {
    // Etapa 1: consulta o estado real do relatório. Enquanto finished_at for nulo,
    // NÃO chama /export. Isso evita o 422 "dados no formato solicitado ainda não disponíveis".
    const definitionResponse = await fetch(
      `${JUSBRASIL_API_BASE_URL}/api/live_report_def/${report.jusbrasil_report_id}`,
      { headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" } },
    );

    if (!definitionResponse.ok) {
      throw new Error(`JusBrasil (status do relatório) respondeu ${definitionResponse.status}: ${await definitionResponse.text().catch(() => "")}`);
    }

    const definition = await definitionResponse.json();
    if (!hasFinishedAt(definition)) {
      await adminClient.from("process_search_reports").update({
        status: "processando",
        error_message: null,
        outcome_message: "Relatório em processamento no JusBrasil. Aguardando finalização para liberar os resultados.",
      }).eq("id", report.id);

      return json({
        success: true,
        status: "processando",
        pending: true,
        provider_status: "processing",
        message: "Relatório ainda está sendo processado no JusBrasil. A exportação será feita somente após a finalização.",
      });
    }

    // Etapa 2: só exporta quando o próprio JusBrasil informar finished_at.
    const rows = await fetchNameSearchExport(apiToken, report.jusbrasil_report_id);
    if (rows === null) {
      await adminClient.from("process_search_reports").update({
        status: "processando",
        error_message: null,
        outcome_message: "Relatório finalizado no JusBrasil; dados de exportação ainda estão sendo disponibilizados.",
      }).eq("id", report.id);
      return json({ success: true, status: "processando", pending: true, provider_status: "finished_waiting_export", message: "O relatório foi finalizado, mas os dados de exportação ainda não estão disponíveis." });
    }

    let imported = 0;
    let addedToCases = 0;

    for (const row of rows) {
      const { data: searchResult, error: upsertError } = await adminClient
        .from("process_search_results")
        .upsert({ report_id: report.id, user_id: user.id, ...row }, { onConflict: "report_id,process_number" })
        .select("id, case_id")
        .single();

      if (upsertError || !searchResult) continue;
      imported += 1;
      if (!row.process_number) continue;

      const { data: existingCase, error: existingCaseError } = await adminClient
        .from("cases")
        .select("id")
        .eq("user_id", user.id)
        .eq("case_number", row.process_number)
        .maybeSingle();
      if (existingCaseError) continue;

      let caseId = existingCase?.id ?? null;
      if (!caseId) {
        const { data: createdCase, error: createCaseError } = await adminClient
          .from("cases")
          .insert({
            user_id: user.id,
            case_number: row.process_number,
            title: row.natureza ? `${row.natureza} — ${row.process_number}` : `Processo ${row.process_number}`,
            client: report.search_name || "Parte pesquisada",
            type: row.area || "Cível",
            status: "active",
            vara: row.vara,
            comarca: row.comarca,
            valor_causa: row.valor,
            data_abertura_tribunal: row.data_distribuicao,
          })
          .select("id")
          .single();
        if (createCaseError || !createdCase) continue;
        caseId = createdCase.id;
        addedToCases += 1;
      }

      if (caseId && searchResult.case_id !== caseId) {
        await adminClient.from("process_search_results").update({ case_id: caseId }).eq("id", searchResult.id);
      }
    }

    await adminClient.from("process_search_reports").update({
      status: "concluido",
      result_count: imported,
      completed_at: new Date().toISOString(),
      outcome_message: `${imported} processo(s) encontrado(s); ${addedToCases} novo(s) adicionado(s) em Processos.`,
      error_message: null,
    }).eq("id", report.id);

    await adminClient.from("notifications").insert({
      user_id: user.id,
      title: "Busca por nome concluída",
      message: `${imported} processo(s) encontrado(s). ${addedToCases} novo(s) já estão em Processos.`,
      link_tab: "cases",
    });

    return json({ success: true, status: "concluido", imported, added_to_cases: addedToCases });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // Fallback defensivo: se o provedor ainda devolver 422 na exportação,
    // mantemos como processamento em vez de marcar a busca como erro.
    if (normalized.includes("respondeu 422") && normalized.includes("ainda nao disponiveis")) {
      await adminClient.from("process_search_reports").update({ status: "processando", error_message: null, outcome_message: "Dados do relatório ainda estão sendo disponibilizados pelo JusBrasil." }).eq("id", report.id);
      return json({ success: true, status: "processando", pending: true, message: "Dados do relatório ainda estão sendo disponibilizados pelo JusBrasil." });
    }

    await adminClient.from("process_search_reports").update({ status: "erro", error_message: message.slice(0, 500) }).eq("id", report.id);
    return json({ error: `Erro ao consultar resultado no JusBrasil: ${message}` }, 502);
  }
});
