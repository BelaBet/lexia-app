// Varredura diária (pg_cron, ver migration
// ..._schedule_daily_process_sync.sql) que roda a sincronização de
// detalhes (movimentações, partes, audiências, autos — mesma lógica de
// sync-case-details, ver _shared/syncCaseDetails.ts) para TODOS os
// processos já importados, não só quando alguém abre a tela do processo.
//
// Autenticação por segredo dedicado (get_cron_dispatch_secret(), guardado
// no Vault) em vez da Service Role Key direta — nunca é chamada pelo
// frontend, só pelo pg_cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { getJusbrasilToken, syncCaseDetails, ProcessSearchResultRow } from "../_shared/syncCaseDetails.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization") || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const { data: expectedToken, error: secretError } = await admin.rpc("get_cron_dispatch_secret");
  if (secretError || !expectedToken || providedToken !== expectedToken) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403 });
  }

  let body: { limit?: number } = {};
  try { body = await req.json(); } catch { /* corpo vazio é ok */ }
  const limit = Math.min(Math.max(body.limit ?? 300, 1), 500);

  const { data: candidates, error: candidatesError } = await admin
    .from("process_search_results")
    .select("id, case_id, user_id, process_number, raw_data, partes_ativas, partes_passivas, advogados, comarca, foro, vara, valor, data_distribuicao, ultima_movimentacao_data, ultima_movimentacao_tipo, ultima_movimentacao_texto, juiz, status_processual, created_at")
    .not("case_id", "is", null)
    .not("process_number", "is", null)
    .order("created_at", { ascending: false });

  if (candidatesError) {
    console.error("sync-all-case-details: error loading candidates", candidatesError);
    return new Response(JSON.stringify({ error: "Erro ao carregar processos" }), { status: 500 });
  }

  // Mantém só o resultado mais recente por processo (case_id) — mesma regra
  // usada pela tela do processo (order by created_at desc limit 1).
  const latestByCase = new Map<string, ProcessSearchResultRow & { raw_data: unknown }>();
  for (const row of candidates ?? []) {
    const caseId = row.case_id as string;
    if (!latestByCase.has(caseId)) latestByCase.set(caseId, row as ProcessSearchResultRow);
  }

  // Prioriza quem nunca foi sincronizado (ou está sincronizado há mais
  // tempo) — se o portfólio crescer além do que cabe numa execução, quem
  // está mais atrasado entra primeiro na próxima.
  const rows = Array.from(latestByCase.values())
    .sort((a, b) => {
      const aRaw = a.raw_data && typeof a.raw_data === "object" ? a.raw_data as Record<string, unknown> : {};
      const bRaw = b.raw_data && typeof b.raw_data === "object" ? b.raw_data as Record<string, unknown> : {};
      const aSync = typeof aRaw._details_synced_at === "string" ? new Date(aRaw._details_synced_at).getTime() : 0;
      const bSync = typeof bRaw._details_synced_at === "string" ? new Date(bRaw._details_synced_at).getTime() : 0;
      return aSync - bSync;
    })
    .slice(0, limit);

  let token: string;
  try {
    token = await getJusbrasilToken(admin);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Integração indisponível" }), { status: 500 });
  }

  let synced = 0;
  let cached = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await syncCaseDetails(admin, row, token, false);
      if (result.cached) cached += 1; else synced += 1;
    } catch (e) {
      failed += 1;
      console.error(`sync-all-case-details: error syncing case ${row.case_id}:`, e instanceof Error ? e.message : e);
    }
  }

  await admin.rpc("record_automation_health", {
    p_key: "daily_case_details_sync",
    p_status: failed > 0 && synced === 0 && cached === 0 ? "error" : "ok",
    p_details: `${synced} sincronizado(s), ${cached} em cache, ${failed} falha(s) de ${rows.length} processo(s) avaliado(s).`,
  });

  return new Response(JSON.stringify({ success: true, evaluated: rows.length, synced, cached, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
