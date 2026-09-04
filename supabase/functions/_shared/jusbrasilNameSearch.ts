// Cliente para a "Consulta Processual por Nome" (relatorio_nome) do
// JusBrasil — usado pelo CRM de busca de processos. Esse produto é
// diferente do Monitoramento (webhook) e da busca por documento/OAB
// (poll-jusbrasil / manual-process-search): aqui a busca é assíncrona,
// paga por relatório, e pode levar até 72h para ficar pronta.
//
// Documentado em https://api.jusbrasil.com.br/docs — host real da API é
// op.digesto.com.br (o domínio api.jusbrasil.com.br só hospeda a
// documentação).

const JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br";

export interface CreateReportResult {
  reportId: string;
}

export async function createNameSearchReport(
  apiKey: string,
  name: string,
  reportLabel: string,
): Promise<CreateReportResult> {
  const response = await fetch(
    `${JUSBRASIL_API_BASE_URL}/api/relatorio-judicial/live_report_def/create_update_from_terms`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ terms: { persons: [{ included: name }] }, name: reportLabel }),
    },
  );
  if (!response.ok) {
    throw new Error(`JusBrasil (criar relatório) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }
  const raw = await response.text();
  const reportId = raw.trim().replace(/^"|"$/g, "");
  if (!reportId) throw new Error("JusBrasil não retornou o id do relatório criado.");
  return { reportId };
}

export async function startNameSearchBilling(apiKey: string, reportId: string): Promise<void> {
  const response = await fetch(
    `${JUSBRASIL_API_BASE_URL}/api/relatorio-judicial/live_report_def/${reportId}/bill_start_update`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (!response.ok) {
    throw new Error(`JusBrasil (iniciar busca) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }
}

interface PandasExport {
  columns: string[];
  index: number[];
  data: unknown[][];
}

export interface NameSearchRow {
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
}

const FIELD_ALIASES: Record<keyof Omit<NameSearchRow, "raw_data">, string[]> = {
  process_number: ["numero_processo", "numero do processo", "número do processo", "processo"],
  tribunal: ["tribunal"],
  data_distribuicao: ["data_distribuicao", "data de distribuição"],
  area: ["area", "área"],
  natureza: ["natureza"],
  valor: ["valor", "valor da causa"],
  partes_ativas: ["partes_ativas", "partes ativas"],
  partes_passivas: ["partes_passivas", "partes passivas"],
  advogados: ["advogados", "advogados+oabs", "advogados e oabs"],
  comarca: ["comarca"],
  foro: ["foro"],
  vara: ["vara"],
  ultima_movimentacao_data: ["data_ultima_movimentacao", "última movimentação (data)", "data da última movimentação"],
  ultima_movimentacao_tipo: ["tipo_ultima_movimentacao", "última movimentação (tipo)"],
  ultima_movimentacao_texto: ["texto_ultima_movimentacao", "última movimentação (texto)"],
  juiz: ["juiz"],
  total_movimentacoes: ["total_movimentacoes", "total de movimentações"],
  sentenca_data: ["data_sentenca", "sentença (data)"],
  sentenca_texto: ["texto_sentenca", "sentença (texto)"],
  status_processual: ["status", "status (suspenso/apreendido/penhorado)"],
  data_extincao: ["data_extincao", "data de extinção"],
  url_detalhes: ["url_detalhes", "url de detalhes"],
};

function findColumnIndex(columns: string[], aliases: string[]): number {
  const normalized = columns.map((c) => c.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias.toLowerCase().trim());
    if (idx !== -1) return idx;
  }
  return -1;
}

function toDateString(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return isNaN(value) ? null : value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

function toIntOrNull(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : Math.round(n);
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

export function parsePandasExport(json: PandasExport): NameSearchRow[] {
  const columns = json.columns ?? [];
  return (json.data ?? []).map((rowValues) => {
    const get = (aliases: string[]) => {
      const idx = findColumnIndex(columns, aliases);
      return idx === -1 ? null : rowValues[idx];
    };
    const rawObject: Record<string, unknown> = {};
    columns.forEach((col, i) => { rawObject[col] = rowValues[i]; });

    return {
      process_number: toStringOrNull(get(FIELD_ALIASES.process_number)),
      tribunal: toStringOrNull(get(FIELD_ALIASES.tribunal)),
      data_distribuicao: toDateString(get(FIELD_ALIASES.data_distribuicao)),
      area: toStringOrNull(get(FIELD_ALIASES.area)),
      natureza: toStringOrNull(get(FIELD_ALIASES.natureza)),
      valor: toNumber(get(FIELD_ALIASES.valor)),
      partes_ativas: get(FIELD_ALIASES.partes_ativas) ?? null,
      partes_passivas: get(FIELD_ALIASES.partes_passivas) ?? null,
      advogados: get(FIELD_ALIASES.advogados) ?? null,
      comarca: toStringOrNull(get(FIELD_ALIASES.comarca)),
      foro: toStringOrNull(get(FIELD_ALIASES.foro)),
      vara: toStringOrNull(get(FIELD_ALIASES.vara)),
      ultima_movimentacao_data: toDateString(get(FIELD_ALIASES.ultima_movimentacao_data)),
      ultima_movimentacao_tipo: toStringOrNull(get(FIELD_ALIASES.ultima_movimentacao_tipo)),
      ultima_movimentacao_texto: toStringOrNull(get(FIELD_ALIASES.ultima_movimentacao_texto)),
      juiz: toStringOrNull(get(FIELD_ALIASES.juiz)),
      total_movimentacoes: toIntOrNull(get(FIELD_ALIASES.total_movimentacoes)),
      sentenca_data: toDateString(get(FIELD_ALIASES.sentenca_data)),
      sentenca_texto: toStringOrNull(get(FIELD_ALIASES.sentenca_texto)),
      status_processual: toStringOrNull(get(FIELD_ALIASES.status_processual)),
      data_extincao: toDateString(get(FIELD_ALIASES.data_extincao)),
      url_detalhes: toStringOrNull(get(FIELD_ALIASES.url_detalhes)),
      raw_data: rawObject,
    };
  });
}

export async function fetchNameSearchExport(apiKey: string, reportId: string): Promise<NameSearchRow[] | null> {
  const response = await fetch(
    `${JUSBRASIL_API_BASE_URL}/api/live_report_def/${reportId}/export?report_format=json&report_type=completo`,
    { headers: { "Authorization": `Bearer ${apiKey}` } },
  );
  if (response.status === 404 || response.status === 202) return null;
  if (!response.ok) {
    throw new Error(`JusBrasil (exportar relatório) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }
  const json = await response.json();
  if (!json || !Array.isArray(json.columns) || !Array.isArray(json.data)) return null;
  return parsePandasExport(json as PandasExport);
}

export interface AutosDocument {
  nome: string;
  url: string;
  tipo?: string | null;
}

export async function fetchCaseAutos(apiKey: string, cnj: string): Promise<AutosDocument[]> {
  const response = await fetch(`${JUSBRASIL_API_BASE_URL}/api/base-judicial/tribproc/${encodeURIComponent(cnj)}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`JusBrasil (autos processuais) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }
  const json = await response.json();
  const rawList = Array.isArray(json) ? json : (json?.documentos ?? json?.anexos ?? json?.arquivos ?? []);
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item: Record<string, unknown>) => ({
      nome: toStringOrNull(item.nome ?? item.name ?? item.titulo ?? item.file_name) || "documento.pdf",
      url: toStringOrNull(item.url ?? item.link ?? item.download_url) || "",
      tipo: toStringOrNull(item.tipo ?? item.type ?? item.content_type),
    }))
    .filter((doc) => doc.url);
}
