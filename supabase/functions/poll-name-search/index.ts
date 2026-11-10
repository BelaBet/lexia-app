// Verificação periódica das buscas por nome (process_search_reports) ainda
// pendentes no JusBrasil — complementa o botão manual "Verificar resultado"
// (check-name-search), que só roda se alguém lembrar de clicar. O relatório
// do JusBrasil pode levar até 72h para ficar pronto do lado deles; até agora
// nada verificava isso sozinho, então um resultado pronto só aparecia na
// LEXIA se o usuário voltasse e clicasse manualmente. Chamada pelo pg_cron —
// ver migration ..._schedule_name_search_poll.sql.
//
// Reaproveita a mesma lógica de verificação/importação do botão manual via
// _shared/checkNameSearchReport.ts, para os dois fluxos não divergirem.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { checkNameSearchReport } from "../_shared/checkNameSearchReport.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";

const MAX_REPORTS_PER_RUN = 25;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Mesma autenticação por segredo dedicado usada por poll-jusbrasil e
  // sync-all-case-details — só o pg_cron chama esta função.
  const authHeader = req.headers.get("Authorization") || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const { data: expectedToken, error: secretError } = await adminClient.rpc("get_cron_dispatch_secret");
  if (secretError || !expectedToken || providedToken !== expectedToken) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403 });
  }

  const { data: reports, error: reportsError } = await adminClient
    .from("process_search_reports")
    .select("id, user_id, jusbrasil_report_id, search_name")
    .eq("status", "processando")
    .not("jusbrasil_report_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(MAX_REPORTS_PER_RUN);

  if (reportsError) {
    console.error("poll-name-search: error loading reports", reportsError);
    return new Response(JSON.stringify({ error: "Erro ao carregar buscas pendentes" }), { status: 500 });
  }

  let apiToken: string;
  try {
    apiToken = await getJusbrasilApiToken(adminClient);
  } catch {
    return new Response(JSON.stringify({ error: "Integração JusBrasil não configurada no backend" }), { status: 500 });
  }

  let checked = 0;
  let concluded = 0;
  let stillPending = 0;
  let failed = 0;

  for (const report of reports || []) {
    if (!report.jusbrasil_report_id) continue;
    checked += 1;
    try {
      const result = await checkNameSearchReport(adminClient, apiToken, {
        id: report.id,
        user_id: report.user_id,
        jusbrasil_report_id: report.jusbrasil_report_id,
        search_name: report.search_name,
      });
      if (result.status === "concluido") concluded += 1;
      else stillPending += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`poll-name-search: error checking report ${report.id}`, message);
      await adminClient.from("process_search_reports").update({ status: "erro", error_message: message.slice(0, 500) }).eq("id", report.id);
    }
  }

  return new Response(JSON.stringify({ success: true, checked, concluded, still_pending: stillPending, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
