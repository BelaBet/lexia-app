// Lógica compartilhada para verificar/importar o resultado de UMA busca por
// nome no JusBrasil (process_search_reports) — usada tanto por
// check-name-search (botão "Verificar resultado", sob demanda, usuário
// autenticado) quanto por poll-name-search (cron periódico, service role,
// percorre todas as buscas pendentes de todos os usuários). Mantendo a
// lógica num só lugar, os dois fluxos não podem divergir.
//
// Extraído de check-name-search/index.ts sem mudar nenhum comportamento.

import { dedupeLawyers, dedupeParties } from "./dedupeParties.ts";

const JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br";

type AdminClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type NameSearchRow = {
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

export interface ReportToCheck {
  id: string;
  user_id: string;
  jusbrasil_report_id: string;
  search_name: string | null;
}

export interface CheckNameSearchResult {
  status: "concluido" | "processando" | "erro";
  pending: boolean;
  provider_status?: string;
  imported: number;
  added_to_cases: number;
  message: string;
  result_source?: "export" | "final";
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
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
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
  const partesAtivas = dedupeParties(partes.filter((p) => truthy(p.is_autora) || truthy(p.is_coautora)));
  const partesPassivas = dedupeParties(partes.filter((p) => truthy(p.is_re)));
  const advogados = dedupeLawyers(partes.flatMap((p) => Array.isArray(p.advogados) ? p.advogados : []).filter(Boolean));
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

// Verifica o status no JusBrasil e, se pronto, importa os resultados para
// process_search_results/cases. Atualiza process_search_reports e cria a
// notificação ao concluir. Não faz nenhuma checagem de autenticação/dono —
// isso é responsabilidade de quem chama (check-name-search valida o JWT do
// usuário; poll-name-search itera relatórios de todos os usuários via
// service role).
export async function checkNameSearchReport(
  adminClient: AdminClient,
  apiToken: string,
  report: ReportToCheck,
): Promise<CheckNameSearchResult> {
  const definitionResponse = await fetch(`${JUSBRASIL_API_BASE_URL}/api/live_report_def/${report.jusbrasil_report_id}`, {
    headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" },
  });
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
    return {
      status: "processando",
      pending: true,
      provider_status: "processing",
      imported: 0,
      added_to_cases: 0,
      message: "Relatório ainda está sendo processado no JusBrasil.",
    };
  }

  let rows = await fetchExport(apiToken, report.jusbrasil_report_id);
  let resultSource: "export" | "final" = "export";
  if (rows === null) {
    rows = await fetchFinal(apiToken, report.jusbrasil_report_id);
    resultSource = "final";
  }
  if (rows === null) {
    await adminClient.from("process_search_reports").update({
      status: "processando",
      error_message: null,
      outcome_message: "Relatório finalizado; aguardando a disponibilização dos dados pelo JusBrasil.",
    }).eq("id", report.id);
    return {
      status: "processando",
      pending: true,
      provider_status: "finished_waiting_data",
      imported: 0,
      added_to_cases: 0,
      message: "Relatório finalizado. Sincronização dos dados ainda em andamento.",
    };
  }

  let imported = 0;
  let addedToCases = 0;
  for (const row of rows) {
    if (!row.process_number) continue;
    const { data: existingResult } = await adminClient.from("process_search_results")
      .select("raw_data").eq("report_id", report.id).eq("process_number", row.process_number).maybeSingle();
    const existingRawData = existingResult?.raw_data && typeof existingResult.raw_data === "object"
      ? existingResult.raw_data as Record<string, unknown>
      : {};
    const mergedRawData = { ...existingRawData, ...(row.raw_data as Record<string, unknown>) };
    const { data: searchResult, error: upsertError } = await adminClient.from("process_search_results")
      .upsert({ report_id: report.id, user_id: report.user_id, ...row, raw_data: mergedRawData }, { onConflict: "report_id,process_number" }).select("id, case_id").single();
    if (upsertError || !searchResult) continue;
    imported += 1;

    const { data: existingCase, error: existingCaseError } = await adminClient.from("cases").select("id")
      .eq("user_id", report.user_id).eq("case_number", row.process_number).maybeSingle();
    if (existingCaseError) continue;
    let caseId = existingCase?.id ?? null;
    if (!caseId) {
      const { data: createdCase, error: createCaseError } = await adminClient.from("cases").insert({
        user_id: report.user_id,
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
  await adminClient.from("notifications").insert({
    user_id: report.user_id,
    title: "Busca por nome concluída",
    message: `${imported} processo(s) encontrado(s). ${addedToCases} novo(s) já estão em Processos.`,
    link_tab: "cases",
  });

  return {
    status: "concluido",
    pending: false,
    imported,
    added_to_cases: addedToCases,
    message: `${imported} processo(s) encontrado(s); ${addedToCases} novo(s) adicionado(s) em Processos.`,
    result_source: resultSource,
  };
}
