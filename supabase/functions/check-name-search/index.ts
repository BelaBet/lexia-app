// Verifica resultado de busca por nome no JusBrasil usando a credencial central da LEXIA.
// Quando o relatório conclui, cada processo encontrado também é criado/atualizado
// em `cases`, para aparecer automaticamente no menu Processos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { fetchNameSearchExport } from "../_shared/jusbrasilNameSearch.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";

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

  if (reportError) {
    console.error("Error loading report:", reportError);
    return json({ error: "Erro ao carregar busca" }, 500);
  }
  if (!report) return json({ error: "Busca não encontrada" }, 404);
  if (report.status === "concluido") return json({ success: true, status: "concluido", already_done: true });
  if (!report.jusbrasil_report_id) return json({ error: "Busca ainda não foi iniciada corretamente" }, 400);

  let apiToken: string;
  try { apiToken = await getJusbrasilApiToken(adminClient); }
  catch { return json({ error: "Integração JusBrasil não configurada no backend" }, 500); }

  try {
    const rows = await fetchNameSearchExport(apiToken, report.jusbrasil_report_id);
    if (rows === null) {
      await adminClient.from("process_search_reports").update({
        status: "processando",
        error_message: null,
        outcome_message: "O JusBrasil ainda está preparando os dados do relatório. Tente novamente mais tarde.",
      }).eq("id", report.id);
      return json({ success: true, status: "processando", message: "O JusBrasil ainda está preparando os dados. Tente novamente mais tarde." });
    }

    let imported = 0;
    let addedToCases = 0;

    for (const row of rows) {
      const { data: searchResult, error: upsertError } = await adminClient
        .from("process_search_results")
        .upsert({ report_id: report.id, user_id: user.id, ...row }, { onConflict: "report_id,process_number" })
        .select("id, case_id")
        .single();

      if (upsertError || !searchResult) {
        console.error("Error upserting search result row:", upsertError);
        continue;
      }
      imported += 1;

      if (!row.process_number) continue;

      const { data: existingCase, error: existingCaseError } = await adminClient
        .from("cases")
        .select("id")
        .eq("user_id", user.id)
        .eq("case_number", row.process_number)
        .maybeSingle();

      if (existingCaseError) {
        console.error("Error checking existing case:", existingCaseError);
        continue;
      }

      let caseId = existingCase?.id ?? null;

      if (!caseId) {
        const processType = row.area || "Cível";
        const processTitle = row.natureza
          ? `${row.natureza} — ${row.process_number}`
          : `Processo ${row.process_number}`;

        const { data: createdCase, error: createCaseError } = await adminClient
          .from("cases")
          .insert({
            user_id: user.id,
            case_number: row.process_number,
            title: processTitle,
            client: report.search_name || "Parte pesquisada",
            type: processType,
            status: "active",
            vara: row.vara,
            comarca: row.comarca,
            valor_causa: row.valor,
            data_abertura_tribunal: row.data_distribuicao,
          })
          .select("id")
          .single();

        if (createCaseError || !createdCase) {
          console.error("Error creating case from name search:", createCaseError);
          continue;
        }

        caseId = createdCase.id;
        addedToCases += 1;
      }

      if (caseId && searchResult.case_id !== caseId) {
        const { error: linkError } = await adminClient
          .from("process_search_results")
          .update({ case_id: caseId })
          .eq("id", searchResult.id);
        if (linkError) console.error("Error linking search result to case:", linkError);
      }
    }

    await adminClient
      .from("process_search_reports")
      .update({
        status: "concluido",
        result_count: imported,
        completed_at: new Date().toISOString(),
        outcome_message: `${imported} processo(s) encontrado(s); ${addedToCases} novo(s) adicionado(s) em Processos.`,
        error_message: null,
      })
      .eq("id", report.id);

    await adminClient.from("notifications").insert({
      user_id: user.id,
      title: "Busca por nome concluída",
      message: `${imported} processo(s) encontrado(s). ${addedToCases} novo(s) já estão em Processos.`,
      link_tab: "cases",
    });

    return json({
      success: true,
      status: "concluido",
      imported,
      added_to_cases: addedToCases,
      message: `${imported} processo(s) encontrado(s). ${addedToCases} novo(s) adicionado(s) automaticamente em Processos.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // O export do JusBrasil devolve 422 enquanto o formato solicitado ainda
    // está sendo preparado. Isso é estado de processamento, não erro da busca.
    if (normalized.includes("respondeu 422") && normalized.includes("ainda nao disponiveis")) {
      await adminClient.from("process_search_reports").update({
        status: "processando",
        error_message: null,
        outcome_message: "O JusBrasil ainda está preparando os dados do relatório. Tente novamente mais tarde.",
      }).eq("id", report.id);
      return json({
        success: true,
        status: "processando",
        pending: true,
        message: "O JusBrasil ainda está preparando os dados do relatório. Nenhuma nova cobrança foi feita. Tente novamente mais tarde.",
      });
    }

    console.error("Error checking name search export:", message);
    await adminClient
      .from("process_search_reports")
      .update({ status: "erro", error_message: message.slice(0, 500) })
      .eq("id", report.id);
    return json({ error: `Erro ao consultar resultado no JusBrasil: ${message}` }, 502);
  }
});
