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

// 1) Cria (ou atualiza) a definição do relatório de busca por nome.
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
  // A resposta documentada é um número inteiro "puro" (o id do relatório).
  const raw = await response.text();
  const reportId = raw.trim().replace(/^"|"$/g, "");
  if (!reportId) throw new Error("JusBrasil não retornou o id do relatório criado.");
  return { reportId };
}

// 2) Inicia a busca paga (consome créditos da conta JusBrasil). Sem essa
//    chamada o relatório fica parado, nunca processa.
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

// Formato "pandas" retornado pelo export: colunas separadas dos valores,
// cada linha de `data` é uma tupla posicional correspondente a `columns`.
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

// Mapeia os nomes de coluna REAIS retornados pelo export de relatório por
// nome, confirmados em https://api.jusbrasil.com.br/docs/relatorio_nome/extras_comandos.html
// ("Exportar dados dos processos de um relatório por nome"): "Processo",
// "Area", "Tribunal", "Data distribuição", "Valor", "Natureza", "Comarca",
// "Foro", "Vara", "Advogados (parte ativa)", "OAB advogado",
// "Última mov. data", "Última mov. tipo", "Transitado julg.", "Sentença",
// "Acordo", "Arquivado" (a doc avisa que essa lista é "dentre outras", ou
// seja, não é exaustiva — os demais campos abaixo sem uma coluna confirmada
// ficam com aliases "best effort" e um TODO).
//
// CORRIGIDO: a versão anterior usava aliases inventados sem um payload real
// para conferir — vários não batem com os nomes reais documentados e nunca
// teriam sido encontrados: "data de distribuição" (real: "Data distribuição",
// sem o "de"), "advogados+oabs"/"advogados e oabs" (na real são DUAS
// colunas separadas: "Advogados (parte ativa)" e "OAB advogado"),
// "última movimentação (data/tipo)" (real: "Última mov. data"/"Última mov.
// tipo", abreviado), "sentença (data)"/"sentença (texto)" (real: uma única
// coluna "Sentença", sem separação data/texto), e "status"/"status
// (suspenso/apreendido/penhorado)" (a real não tem uma coluna "status"
// única — são três colunas booleanas separadas: "Transitado julg.",
// "Acordo", "Arquivado", combinadas abaixo em buildStatusProcessual).
const FIELD_ALIASES: Record<keyof Omit<NameSearchRow, "raw_data" | "advogados" | "status_processual">, string[]> = {
  process_number: ["numero_processo", "numero do processo", "número do processo", "processo"],
  tribunal: ["tribunal"],
  data_distribuicao: ["data_distribuicao", "data distribuição", "data de distribuição"],
  area: ["area", "área"],
  natureza: ["natureza"],
  valor: ["valor", "valor da causa"],
  partes_ativas: ["partes_ativas", "partes ativas"],
  partes_passivas: ["partes_passivas", "partes passivas"],
  comarca: ["comarca"],
  foro: ["foro"],
  vara: ["vara"],
  ultima_movimentacao_data: ["ultima mov. data", "última mov. data", "data_ultima_movimentacao", "última movimentação (data)", "data da última movimentação"],
  ultima_movimentacao_tipo: ["ultima mov. tipo", "última mov. tipo", "tipo_ultima_movimentacao", "última movimentação (tipo)"],
  ultima_movimentacao_texto: ["texto_ultima_movimentacao", "última movimentação (texto)"],
  juiz: ["juiz"],
  total_movimentacoes: ["total_movimentacoes", "total de movimentações"],
  sentenca_data: ["data_sentenca", "sentença (data)"],
  sentenca_texto: ["sentenca", "sentença", "texto_sentenca", "sentença (texto)"],
  data_extincao: ["data_extincao", "data de extinção"],
  url_detalhes: ["url_detalhes", "url de detalhes"],
};

// Colunas confirmadas para advogados (duas colunas separadas, não uma só) e
// para os três indicadores booleanos combinados em status_processual.
const ADVOGADOS_NOME_ALIASES = ["advogados (parte ativa)", "advogados", "advogados+oabs", "advogados e oabs"];
const ADVOGADOS_OAB_ALIASES = ["oab advogado", "oab do advogado", "oab advogados"];
const STATUS_FLAG_ALIASES: Array<{ label: string; aliases: string[] }> = [
  { label: "Transitado em julgado", aliases: ["transitado julg.", "transitado julgado", "transitado em julgado"] },
  { label: "Acordo", aliases: ["acordo"] },
  { label: "Arquivado", aliases: ["arquivado"] },
];

// Normaliza removendo acentos e espaços duplicados, além de minúsculas —
// os nomes de coluna documentados usam acentuação (ex.: "última", "área")
// que precisa bater independente de eventual variação de acentuação da API.
function normalizeColumnName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function findColumnIndex(columns: string[], aliases: string[]): number {
  const normalized = columns.map(normalizeColumnName);
  for (const alias of aliases) {
    const idx = normalized.indexOf(normalizeColumnName(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

// "Transitado julg.", "Acordo" e "Arquivado" são colunas booleanas
// separadas na API (não existe uma única coluna "status") — combinamos as
// que vierem verdadeiras numa string legível para status_processual.
function buildStatusProcessual(columns: string[], rowValues: unknown[]): string | null {
  const active: string[] = [];
  for (const flag of STATUS_FLAG_ALIASES) {
    const idx = findColumnIndex(columns, flag.aliases);
    if (idx === -1) continue;
    const value = rowValues[idx];
    const isTrue = value === true || value === "true" || value === "sim" || value === "Sim" || value === 1 || value === "1";
    if (isTrue) active.push(flag.label);
  }
  return active.length > 0 ? active.join(", ") : null;
}

// "Advogados (parte ativa)" e "OAB advogado" são colunas separadas (não uma
// única coluna combinada) — juntamos os dois valores brutos para não perder
// nenhuma das duas informações, mantendo os originais em raw_data também.
function buildAdvogados(columns: string[], rowValues: unknown[]): unknown {
  const nomeIdx = findColumnIndex(columns, ADVOGADOS_NOME_ALIASES);
  const oabIdx = findColumnIndex(columns, ADVOGADOS_OAB_ALIASES);
  const nome = nomeIdx === -1 ? null : rowValues[nomeIdx];
  const oab = oabIdx === -1 ? null : rowValues[oabIdx];
  if (nome == null && oab == null) return null;
  if (oab == null) return nome;
  if (nome == null) return { oab };
  return { nome, oab };
}

function toDateString(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// CORRIGIDO (encontrado em teste massivo desta correção): a versão anterior
// assumia sempre formato brasileiro ("12.345,67" -> remove todos os pontos,
// troca vírgula por ponto), o que inflava em 100x qualquer valor que já
// viesse em formato simples/americano (ex.: "150000.50" virava "15000050").
// A documentação não garante qual dos dois formatos a coluna "Valor" usa —
// mesma heurística já usada em _shared/pollJusbrasilIntegration.ts:
// só trata como separador de milhar brasileiro quando o padrão realmente
// indica isso (vírgula presente, ou múltiplos pontos / mais de 2 dígitos
// após o único ponto).
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return isNaN(value) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;

  const raw = value.trim();
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized: string;

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (hasComma) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    const dotCount = (raw.match(/\./g) || []).length;
    const digitsAfterLastDot = raw.length - raw.lastIndexOf(".") - 1;
    normalized = (dotCount === 1 && digitsAfterLastDot <= 2) ? raw : raw.replace(/\./g, "");
  } else {
    normalized = raw;
  }

  const n = Number(normalized);
  return isNaN(n) ? null : n;
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

// Converte o export "pandas" (colunas + linhas posicionais) numa lista de
// objetos já no formato das nossas colunas.
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
      advogados: buildAdvogados(columns, rowValues),
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
      status_processual: buildStatusProcessual(columns, rowValues),
      data_extincao: toDateString(get(FIELD_ALIASES.data_extincao)),
      url_detalhes: toStringOrNull(get(FIELD_ALIASES.url_detalhes)),
      raw_data: rawObject,
    };
  });
}

// 3) Busca o resultado do relatório (formato pandas). Se ainda estiver
//    processando, a API pode responder algo que não é o export completo —
//    tratamos qualquer corpo sem "columns"/"data" como "ainda não pronto".
export async function fetchNameSearchExport(apiKey: string, reportId: string): Promise<NameSearchRow[] | null> {
  const response = await fetch(
    `${JUSBRASIL_API_BASE_URL}/api/live_report_def/${reportId}/export?report_format=json&report_type=completo`,
    { headers: { "Authorization": `Bearer ${apiKey}` } },
  );
  if (response.status === 404 || response.status === 202) return null; // ainda processando
  if (!response.ok) {
    throw new Error(`JusBrasil (exportar relatório) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }
  const json = await response.json();
  if (!json || !Array.isArray(json.columns) || !Array.isArray(json.data)) return null;
  return parsePandasExport(json as PandasExport);
}

// 4) Autos processuais — pede a listagem de peças/anexos de um processo
//    específico pelo número CNJ. As URLs retornadas são válidas por até 7
//    dias. `atualiza_tribunal_anexos: true` teria custo adicional segundo a
//    documentação, então mantemos false (usa o que já está em cache do
//    JusBrasil).
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
  // Formato exato da lista de documentos não confirmado pela documentação
  // pública (só o lado do pedido estava documentado) — aceitamos algumas
  // formas prováveis e não quebramos se vier vazio.
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
