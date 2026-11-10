// Verifica resultado de busca por nome no JusBrasil usando a credencial central da LEXIA.
// Botão "Verificar resultado" — ação manual, sob demanda, usuário autenticado.
// A lógica de verificação/importação em si é compartilhada com poll-name-search
// (cron periódico) via _shared/checkNameSearchReport.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { checkNameSearchReport } from "../_shared/checkNameSearchReport.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (!body.report_id) return json({ error: "report_id é obrigatório" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: report, error: reportError } = await adminClient.from("process_search_reports")
    .select("id, user_id, jusbrasil_report_id, status, integration_id, search_name")
    .eq("id", body.report_id).eq("user_id", user.id).maybeSingle();
  if (reportError) return json({ error: "Erro ao carregar busca" }, 500);
  if (!report) return json({ error: "Busca não encontrada" }, 404);
  if (report.status === "concluido") return json({ success: true, status: "concluido", already_done: true });
  if (!report.jusbrasil_report_id) return json({ error: "Busca ainda não foi iniciada corretamente" }, 400);

  let apiToken: string;
  try { apiToken = await getJusbrasilApiToken(adminClient); } catch { return json({ error: "Integração JusBrasil não configurada no backend" }, 500); }

  try {
    const result = await checkNameSearchReport(adminClient, apiToken, {
      id: report.id,
      user_id: report.user_id,
      jusbrasil_report_id: report.jusbrasil_report_id,
      search_name: report.search_name,
    });
    return json({
      success: true,
      status: result.status,
      pending: result.pending,
      provider_status: result.provider_status,
      imported: result.imported,
      added_to_cases: result.added_to_cases,
      message: result.message,
      result_source: result.result_source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await adminClient.from("process_search_reports").update({ status: "erro", error_message: message.slice(0, 500) }).eq("id", report.id);
    return json({ error: `Erro ao consultar resultado no JusBrasil: ${message}` }, 502);
  }
});
