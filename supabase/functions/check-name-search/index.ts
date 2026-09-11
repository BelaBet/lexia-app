// Verifica resultado de busca por nome no JusBrasil usando a credencial central da LEXIA.
// Quando o relatório termina, tenta primeiro o export JSON e usa /final como fallback.
// Isso evita deixar a busca presa quando o arquivo já está disponível ao cliente,
// mas o endpoint de exportação JSON ainda não foi materializado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br";

type NameSearchRow = {
  process_number: string | null;
  tribunal: string | null;
  data_distribuicao: string | null;
  area: string | null;
  natureza: string | null;
  valor: number | null;
  partes_ativas: unknown;
  partes_passivas: unknown;
  advogados: unknown;
  comarca: string | null;
  foro: string | null;
  vara: string | null;
  ultima_movimentacao_data: string | null;
  ultima_movimentacao_tipo: string | null;
  ultima_movimentacao_texto: string | null;
  juiz: string | null;
  total_movimentacoes: number | null;
  sentenca_data: string | null;
  sentenca_texto: string | null;
  status_processual: string | null;
  data_extincao: string | null;
  url_detalhes: string | null;
  raw_data: Record<string, unknown>;
};

function buildCorsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": configured.length ? (configured.includes(origin) ? origin : configured[0]) : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function hasFinishedAt(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const finishedAt = (payload as Record<string, unknown>).finished_at;
  if (finishedAt == null) return false;
  if (typeof finishedAt === "string") return finishedAt.trim().length > 0;
  if (typeof finishedAt === "number") return Number.isFinite(finishedAt) && finishedAt > 0;
  if (typeof finishedAt === "object") return (finishedAt as Record<string, unknown>)["$date"] != null;
  return true;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  let normalized = raw;
  if (raw.includes(",") && raw.includes(".")) {
    normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || String(value ?? "").toLowerCase() === "true" || String(value ?? "").toLowerCase() === "sim";
}

function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function parsePandasExport(payload: Record<string, unknown>): NameSearchRow[] | null {
  const columns = payload.columns;
  const data = payload.data;
  if (!Array.isArray(columns) || !Array.isArray(data)) return null;
  const cols = columns.map((c) => String(c));
  const normalized = cols.map(normalizeKey);
  const getIndex = (...aliases: string[]) => aliases.map(normalizeKey).map((a) => normalized.indexOf(a)).find((i) => i >= 0) ?? -1;

  return data.map((rawRow) => {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const get = (...aliases: string[]) => { const i = getIndex(...aliases); return i >= 0 ? row[i] : null; };
    const raw: Record<string, unknown> = {};
    cols.forEach((c, i) => { raw[c] = row[i]; });
    const flags = [
      ["Transitado em julgado", get("Transitado julg.", "Transitado em julgado")],
      ["Acordo", get("Acordo")],
      ["Arquivado", get("Arquivado")],
    ].filter(([, v]) => truthy(v)).map(([label]) => label as string);
    const advogadoNome = get("Advogados (parte ativa)", "Advogados");
    const advogadoOab = get("OAB advogado", "OAB do advogado");

    return {
      process_number: str(get("Processo", "numero_processo", "Número do processo")),
      tribunal: str(get("Tribunal")),
      data_distribuicao: dateOnly(get("Data distribuição", "Data de distribuição", "data_distribuicao")),
      area: str(get("Area", "Área")),
      natureza: str(get("Natureza")),
      valor: num(get("Valor", "Valor da causa")),
      partes_ativas: get("Partes ativas", "partes_ativas"),
      partes_passivas: get("Partes passivas", "partes_passivas"),
      advogados: advogadoNome == null && advogadoOab == null ? null : { nome: advogadoNome, oab: advogadoOab },
      comarca: str(get("Comarca")),
      foro: str(get("Foro")),
      vara: str(get("Vara")),
      ultima_movimentacao_data: dateOnly(get("Última mov. data", "ultima mov. data")),
      ultima_movimentacao_tipo: str(get("Última mov. tipo", "ultima mov. tipo")),
      ultima_movimentacao_texto: str(get("Última movimentação (texto)", "texto_ultima_movimentacao")),
      juiz: str(get("Juiz")),
      total_movimentacoes: num(get("Total de movimentações", "total_movimentacoes")),
      sentenca_data: dateOnly(get("Sentença (data)", "data_sentenca")),
      sentenca_texto: str(get("Sentença", "sentenca", "Sentença (texto)")),
      status_processual: flags.length ? flags.join(", ") : null,
      data_extincao: dateOnly(get("Data de extinção", "data_extincao")),
      url_detalhes: str(get("URL de detalhes", "url_detalhes")),
      raw_data: raw,
    };
  });
}

async function fetchExport(apiToken: string, providerReportId: string): Promise<NameSearchRow[] | null> {
  const response = await fetch(`${JUSBRASIL_API_BASE_URL}/api/live_report_def/${providerReportId}/export?report_format=json&report_type=completo`, {
    headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" },
  });
  if ([202, 404, 422].includes(response.status)) return null;
  if (!response.ok) throw new Error(`JusBrasil (exportar relatório) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  const payload = await response.json();
  return payload && typeof payload === "object" ? parsePandasExport(payload as Record<string, unknown>) : null;
}

function mapFinalSource(source: Record<string, unknown>): NameSearchRow {
  const partes = Array.isArray(source.partes) ? source.partes.filter((p) => p && typeof p === "object") as Record<string, unknown>[] : [];
  const partesAtivas = partes.filter((p) => truthy(p.is_autora) || truthy(p.is_coautora));
  const partesPassivas = partes.filter((p) => truthy(p.is_re));
  const advogados = partes.flatMap((p) => Array.isArray(p.advogados) ? p.advogados : []).filter(Boolean);
  const ultima = source.ultimaMovimentacao && typeof source.ultimaMovimentacao === "object" ? source.ultimaMovimentacao as Record<string, unknown> : {};
  const status: string[] = [];
  if (str(source.situacao)) status.push(str(source.situacao)!);
  if (truthy(source.arquivado) && !status.some((s) => normalizeKey(s).includes("arquivad"))) status.push("Arquivado");
  if (truthy(source.extinto) && !status.some((s) => normalizeKey(s).includes("extint"))) status.push("Extinto");

  return {
    process_number: str(source.numero ?? source.numeroProcesso ?? source.processo),
    tribunal: str(source.tribunal),
    data_distribuicao: dateOnly(source.distribuicaoData ?? source.dataDistribuicao),
    area: str(source.area),
    natureza: str(source.classeNatureza ?? source.natureza),
    valor: num(source.valor ?? source.valorCausa),
    partes_ativas: partesAtivas,
    partes_passivas: partesPassivas,
    advogados: advogados.length ? advogados : null,
    comarca: str(source.comarca),
    foro: str(source.foro),
    vara: str(source.vara),
    ultima_movimentacao_data: dateOnly(ultima.data ?? source.ultimaMovimentacaoData),
    ultima_movimentacao_tipo: str(ultima.tipo ?? source.ultimaMovimentacaoTipo),
    ultima_movimentacao_texto: str(ultima.texto ?? source.ultimaMovimentacaoTexto),
    juiz: str(source.juiz),
    total_movimentacoes: num(source.totalMovimentacoes ?? source.total_movimentacoes),
    sentenca_data: dateOnly(source.sentencaData),
    sentenca_texto: str(source.sentenca ?? source.sentencaTexto),
    status_processual: status.length ? status.join(", ") : null,
    data_extincao: dateOnly(source.dataExtincao ?? source.extincaoData),
    url_detalhes: str(source.urlDetalhes ?? source.url_detalhes ?? source.link),
    raw_data: source,
  };
}

async function fetchFinal(apiToken: string, providerReportId: string): Promise<NameSearchRow[] | null> {
  const perPage = 100;
  const rows: NameSearchRow[] = [];
  for (let page = 1; page <= 500; page++) {
    const response = await fetch(`${JUSBRASIL_API_BASE_URL}/api/relatorio-judicial/live_report_def/${providerReportId}/final`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ filter: {}, sort: [{ distribuicaoData: { order: "desc" } }], page, per_page: perPage }),
    });
    if ([202, 404, 422].includes(response.status)) return rows.length ? rows : null;
    if (!response.ok) throw new Error(`JusBrasil (resultado final) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
    const payload = await response.json();
    const hitsContainer = payload?.data?.hits;
    const hits = hitsContainer?.hits;
    if (!Array.isArray(hits)) return rows.length ? rows : null;
    for (const hit of hits) {
      const source = hit?._source;
      if (source && typeof source === "object") rows.push(mapFinalSource(source as Record<string, unknown>));
    }
    const totalRaw = hitsContainer?.total;
    const total = typeof totalRaw === "number" ? totalRaw : (typeof totalRaw?.value === "number" ? totalRaw.value : null);
    if (hits.length === 0 || hits.length < perPage || (total !== null && rows.length >= total)) break;
  }
  return rows;
}

async function getJusbrasilApiToken(adminClient: ReturnType<typeof createClient>): Promise<string> {
  const envToken = Deno.env.get("JUSBRASIL_API_TOKEN")?.trim();
  if (envToken) return envToken;
  const { data, error } = await adminClient.rpc("get_jusbrasil_api_token");
  if (error) throw new Error("Integração JusBrasil não configurada no backend");
  const token = typeof data === "string" ? data.trim() : "";
  if (!token) throw new Error("JUSBRASIL_API_TOKEN não encontrado no backend");
  return token;
}

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
    const definitionResponse = await fetch(`${JUSBRASIL_API_BASE_URL}/api/live_report_def/${report.jusbrasil_report_id}`, {
      headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" },
    });
    if (!definitionResponse.ok) throw new Error(`JusBrasil (status do relatório) respondeu ${definitionResponse.status}: ${await definitionResponse.text().catch(() => "")}`);
    const definition = await definitionResponse.json();
    if (!hasFinishedAt(definition)) {
      await adminClient.from("process_search_reports").update({ status: "processando", error_message: null, outcome_message: "Relatório em processamento no JusBrasil. Aguardando finalização para liberar os resultados." }).eq("id", report.id);
      return json({ success: true, status: "processando", pending: true, provider_status: "processing", message: "Relatório ainda está sendo processado no JusBrasil." });
    }

    let rows = await fetchExport(apiToken, report.jusbrasil_report_id);
    let resultSource = "export";
    if (rows === null) {
      rows = await fetchFinal(apiToken, report.jusbrasil_report_id);
      resultSource = "final";
    }
    if (rows === null) {
      await adminClient.from("process_search_reports").update({ status: "processando", error_message: null, outcome_message: "Relatório finalizado; aguardando a disponibilização dos dados pelo JusBrasil." }).eq("id", report.id);
      return json({ success: true, status: "processando", pending: true, provider_status: "finished_waiting_data", message: "Relatório finalizado. Sincronização dos dados ainda em andamento." });
    }

    let imported = 0;
    let addedToCases = 0;
    for (const row of rows) {
      if (!row.process_number) continue;
      const { data: searchResult, error: upsertError } = await adminClient.from("process_search_results")
        .upsert({ report_id: report.id, user_id: user.id, ...row }, { onConflict: "report_id,process_number" }).select("id, case_id").single();
      if (upsertError || !searchResult) continue;
      imported += 1;

      const { data: existingCase, error: existingCaseError } = await adminClient.from("cases").select("id")
        .eq("user_id", user.id).eq("case_number", row.process_number).maybeSingle();
      if (existingCaseError) continue;
      let caseId = existingCase?.id ?? null;
      if (!caseId) {
        const { data: createdCase, error: createCaseError } = await adminClient.from("cases").insert({
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
        }).select("id").single();
        if (createCaseError || !createdCase) continue;
        caseId = createdCase.id;
        addedToCases += 1;
      }
      if (caseId && searchResult.case_id !== caseId) await adminClient.from("process_search_results").update({ case_id: caseId }).eq("id", searchResult.id);
    }

    await adminClient.from("process_search_reports").update({
      status: "concluido",
      result_count: imported,
      completed_at: new Date().toISOString(),
      outcome_message: `${imported} processo(s) encontrado(s); ${addedToCases} novo(s) adicionado(s) em Processos.`,
      error_message: null,
    }).eq("id", report.id);
    await adminClient.from("notifications").insert({ user_id: user.id, title: "Busca por nome concluída", message: `${imported} processo(s) encontrado(s). ${addedToCases} novo(s) já estão em Processos.`, link_tab: "cases" });

    return json({ success: true, status: "concluido", imported, added_to_cases: addedToCases, result_source: resultSource });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await adminClient.from("process_search_reports").update({ status: "erro", error_message: message.slice(0, 500) }).eq("id", report.id);
    return json({ error: `Erro ao consultar resultado no JusBrasil: ${message}` }, 502);
  }
});
