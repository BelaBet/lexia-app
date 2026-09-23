// Varredura diária (pg_cron, ver migration
// ..._schedule_daily_process_sync.sql) que roda a sincronização de
// detalhes (movimentações, partes, audiências, autos — mesma lógica de
// sync-case-details, ver _shared/syncCaseDetails.ts) para TODOS os
// processos já importados, não só quando alguém abre a tela do processo.
//
// Encadeamento: em vez de processar só um lote (limit) por execução e
// deixar o resto pra próxima rodada agendada (24h depois), esta função
// processa um lote e dispara a si mesma pro próximo lote em segundo plano
// (EdgeRuntime.waitUntil — continua rodando depois da resposta HTTP ter
// voltado), passando a fila restante já calculada (remaining_ids) em vez
// de reconsultar e reordenar do zero — assim nenhum processo é pulado nem
// reprocessado por causa de itens que mudaram de posição no meio da
// cadeia. Uma falha isolada (ex.: um CNJ que sempre dá erro) não trava a
// fila: o próximo lote já é o resto da lista, não uma nova consulta que
// traria esse mesmo item de novo na frente. max_chain limita o número de
// saltos como rede de segurança contra loop indevido.
//
// verify_jwt=false: quem chama é só o pg_cron (ou a própria função se
// encadeando), autenticado por um segredo dedicado
// (get_cron_dispatch_secret(), guardado no Vault — não é um JWT do
// Supabase) validado no código abaixo. Nunca é chamada pelo frontend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { getJusbrasilToken, syncCaseDetails, ProcessSearchResultRow } from "../_shared/syncCaseDetails.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

interface RequestBody {
  limit?: number;
  max_chain?: number;
  chain_depth?: number;
  remaining_ids?: string[];
}

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
  const { data: dispatchSecret, error: secretError } = await admin.rpc("get_cron_dispatch_secret");
  if (secretError || !dispatchSecret || providedToken !== dispatchSecret) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403 });
  }

  let body: RequestBody = {};
  try { body = await req.json(); } catch { /* corpo vazio é ok */ }
  const batchSize = Math.min(Math.max(body.limit ?? 40, 1), 100);
  const maxChain = Math.min(Math.max(body.max_chain ?? 25, 1), 50);
  const chainDepth = body.chain_depth ?? 0;

  let queueIds: string[];
  const rowsById = new Map<string, ProcessSearchResultRow & { raw_data: unknown }>();

  if (body.remaining_ids) {
    // Continuação de uma cadeia já em andamento: a fila (já deduplicada e
    // ordenada) veio pronta do lote anterior.
    queueIds = body.remaining_ids;
    if (queueIds.length > 0) {
      const { data: rows, error: rowsError } = await admin
        .from("process_search_results")
        .select("id, case_id, user_id, process_number, raw_data, partes_ativas, partes_passivas, advogados, comarca, foro, vara, valor, data_distribuicao, ultima_movimentacao_data, ultima_movimentacao_tipo, ultima_movimentacao_texto, juiz, status_processual")
        .in("id", queueIds.slice(0, batchSize));
      if (rowsError) {
        console.error("sync-all-case-details: error loading batch rows", rowsError);
        return new Response(JSON.stringify({ error: "Erro ao carregar processos" }), { status: 500 });
      }
      for (const row of rows ?? []) rowsById.set(row.id as string, row as ProcessSearchResultRow);
    }
  } else {
    // Início da cadeia (disparo do pg_cron): monta a fila inteira, do
    // processo com sincronização mais atrasada (ou nunca sincronizado)
    // para o mais recente.
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

    // Mantém só o resultado mais recente por processo (case_id) — mesma
    // regra usada pela tela do processo (order by created_at desc limit 1).
    const latestByCase = new Map<string, ProcessSearchResultRow & { raw_data: unknown }>();
    for (const row of candidates ?? []) {
      const caseId = row.case_id as string;
      if (!latestByCase.has(caseId)) latestByCase.set(caseId, row as ProcessSearchResultRow);
    }

    const sorted = Array.from(latestByCase.values()).sort((a, b) => {
      const aRaw = a.raw_data && typeof a.raw_data === "object" ? a.raw_data as Record<string, unknown> : {};
      const bRaw = b.raw_data && typeof b.raw_data === "object" ? b.raw_data as Record<string, unknown> : {};
      const aSync = typeof aRaw._details_synced_at === "string" ? new Date(aRaw._details_synced_at).getTime() : 0;
      const bSync = typeof bRaw._details_synced_at === "string" ? new Date(bRaw._details_synced_at).getTime() : 0;
      return aSync - bSync;
    });

    queueIds = sorted.map((row) => row.id);
    for (const row of sorted.slice(0, batchSize)) rowsById.set(row.id, row);
  }

  const batchIds = queueIds.slice(0, batchSize);
  const remainingIds = queueIds.slice(batchSize);

  let token: string | null = null;
  let tokenError: string | null = null;
  if (batchIds.length > 0) {
    try {
      token = await getJusbrasilToken(admin);
    } catch (e) {
      tokenError = e instanceof Error ? e.message : "Integração indisponível";
    }
  }

  let synced = 0;
  let cached = 0;
  let failed = 0;

  if (token) {
    for (const id of batchIds) {
      const row = rowsById.get(id);
      if (!row) { failed += 1; continue; }
      try {
        const result = await syncCaseDetails(admin, row, token, false);
        if (result.cached) cached += 1; else synced += 1;
      } catch (e) {
        failed += 1;
        console.error(`sync-all-case-details: error syncing case ${row.case_id}:`, e instanceof Error ? e.message : e);
      }
    }
  } else if (tokenError) {
    failed = batchIds.length;
  }

  const hasMore = remainingIds.length > 0;
  const canContinueChain = chainDepth + 1 < maxChain;

  if (hasMore && canContinueChain && !tokenError) {
    const nextCall = fetch(`${supabaseUrl}/functions/v1/sync-all-case-details`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dispatchSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: batchSize, max_chain: maxChain, chain_depth: chainDepth + 1, remaining_ids: remainingIds }),
    }).catch((e) => console.error("sync-all-case-details: error chaining next batch:", e instanceof Error ? e.message : e));

    if (typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(nextCall);
    } else {
      // Ambiente sem EdgeRuntime.waitUntil (ex.: execução local) — melhor
      // esforço, aguarda inline.
      await nextCall;
    }
  }

  await admin.rpc("record_automation_health", {
    p_key: "daily_case_details_sync",
    p_status: tokenError || (failed > 0 && synced === 0 && cached === 0) ? "error" : "ok",
    p_details: tokenError
      ? `Falha ao obter token JusBrasil: ${tokenError}`
      : `Lote ${chainDepth + 1}: ${synced} sincronizado(s), ${cached} em cache, ${failed} falha(s) de ${batchIds.length}. ${hasMore ? `${remainingIds.length} restante(s) na fila.` : "Fila concluída."}`,
  });

  return new Response(JSON.stringify({
    success: true,
    chain_depth: chainDepth,
    evaluated: batchIds.length,
    synced,
    cached,
    failed,
    queued_remaining: remainingIds.length,
    chained: hasMore && canContinueChain && !tokenError,
    error: tokenError ?? undefined,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
