// Lógica de busca ativa no JusBrasil para UMA integração — compartilhada
// entre poll-jusbrasil (roda para todas as integrações ativas, 1x/dia via
// pg_cron) e manual-process-search (dispara a busca para uma única
// integração, sob demanda, pelo botão "Buscar agora" na tela de
// Integrações). Mantendo a lógica num só lugar, os dois fluxos não podem
// divergir.
//
// ENDPOINTS REAIS (confirmado em https://api.jusbrasil.com.br/docs/ — ver
// BUG-001: a versão anterior deste arquivo usava um endpoint inventado,
// "/v1/processos/consulta", marcado no próprio código como provisório e
// nunca confirmado contra a documentação):
//
// 1) Consulta por CPF/CNPJ ("Consulta processual por CPF/CNPJ" —
//    background-check): host `https://api.jusbrasil.com.br`, autenticação
//    via header `apikey` (NÃO é "Authorization: Bearer"), endpoints
//    POST /background-check/lawsuits/{civil,criminal,trabalhista}, corpo
//    `{ documentNumber, pagination: { cursor, size } }`. É síncrono: a
//    resposta já traz os processos encontrados na hora
//    (docs: consulta_processual_por_cpf_cnpj/como_consultar.html).
//
// 2) Consulta por OAB ("Busca de processos por OAB"): host
//    `https://op.digesto.com.br`, autenticação via
//    `Authorization: Bearer <token>`. Ao contrário da consulta por
//    CPF/CNPJ, esta NÃO é uma busca síncrona: é preciso primeiro registrar
//    a OAB para monitoramento (POST /api/monitoramento/oab/acompanhamento/)
//    e só depois consultar os processos já vinculados a ela
//    (GET /api/monitoramento/oab/vinculos/processos/oab) — o vínculo de
//    processos novos é processado de forma assíncrona pelo provedor
//    (pode não haver nada na primeira consulta, mesmo com a OAB correta).
//    A API só devolve o número do processo (CNJ) vinculado, sem o
//    conteúdo/movimentação em si — para isso ainda seria necessário uma
//    consulta processual adicional por CNJ, que este arquivo não faz
//    (fica fora do escopo desta correção; ver TODO em fetchOabLinkedProcesses).
//    (docs: oab/realizando_a_busca.html, oab/index.html)
//
// Também é responsável por registrar o "contador financeiro de pesquisas
// processuais": toda vez que esta função roda para uma integração — venha
// de busca ativa agendada ou de busca manual — grava um registro em
// process_search_charges usando o valor configurado em
// publication_integrations.price_per_search (0 quando não configurado).

import { findOrCreateCaseId, ProcessualData } from "./findOrCreateCase.ts";
import { syncDeadlineEvents, attachDocumentIfAvailable } from "./syncPublicationExtras.ts";
import { computeFallbackExternalId } from "./externalId.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

type AdminClient = SupabaseClient;

const BACKGROUND_CHECK_BASE_URL = "https://api.jusbrasil.com.br";
const OAB_MONITORING_BASE_URL = "https://op.digesto.com.br";

export interface JusbrasilProcessItem {
  id?: string;
  numero_processo?: string;
  processo?: string;
  resumo?: string;
  conteudo?: string;
  data_publicacao?: string;
  data?: string;
  vara?: string;
  orgao_julgador?: string;
  orgaoJulgador?: string;
  comarca?: string;
  municipio?: string;
  foro?: string;
  valor_causa?: string | number;
  valorCausa?: string | number;
  valor_da_causa?: string | number;
  data_distribuicao?: string;
  dataDistribuicao?: string;
  data_abertura?: string;
  dataAbertura?: string;
  data_aceitacao?: string;
  dataAceitacao?: string;
  prazo_externo?: string;
  prazoExterno?: string;
  prazo?: string;
  deadline?: string;
  prazo_interno?: string;
  prazoInterno?: string;
  [key: string]: unknown;
}

export interface JusbrasilIntegration {
  id: string;
  user_id: string;
  api_key: string | null;
  monitor_document: string | null;
  monitor_oab: string | null;
  price_per_search?: number | null;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function firstDate(...values: unknown[]): string | null {
  const raw = firstString(...values);
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// Converte um número que pode vir em formato brasileiro ("12.345,67") OU
// americano/JSON puro ("12345.67") — o provedor não documenta qual dos dois
// formatos usa, e assumir sempre o formato brasileiro (removendo todos os
// pontos e trocando vírgula por ponto) inflava em 100x qualquer valor que já
// viesse como "12345.67" (o "." é removido e o número vira "1234567").
function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string" && v.trim().length > 0) {
      const raw = v.trim();
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
        normalized = (dotCount === 1 && digitsAfterLastDot <= 2)
          ? raw
          : raw.replace(/\./g, "");
      } else {
        normalized = raw;
      }

      const parsed = Number(normalized);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// 1) Consulta por CPF/CNPJ — background-check (síncrono)
// ---------------------------------------------------------------------

interface BackgroundCheckParty {
  nome?: string;
  papel?: string;
}

interface BackgroundCheckLawyer {
  nome?: string;
  oab?: string;
}

interface BackgroundCheckStatus {
  data?: string;
  inferido?: string;
  normalizado?: string;
  tribunal?: string;
}

interface BackgroundCheckLawsuit {
  tipo_processo?: string;
  numero_processo?: string;
  tribunal?: string;
  UF?: string;
  comarca?: string;
  forum?: string;
  valor_causa?: string | number | null;
  data_ultima_atualizacao?: string;
  data_andamento_mais_recente?: string;
  assunto?: string;
  natureza?: string;
  classe_processual?: string;
  nome_na_capa?: string;
  link?: string;
  partes?: BackgroundCheckParty[];
  advogados?: BackgroundCheckLawyer[];
  status?: BackgroundCheckStatus;
  [key: string]: unknown;
}

interface BackgroundCheckResponse {
  nome?: string;
  identificacao?: { valor: string; tipo: string };
  processos?: BackgroundCheckLawsuit[];
  pagination?: { endCursor?: string; hasNextPage?: boolean; total?: number };
}

async function fetchBackgroundCheckLawsuits(
  apiKey: string,
  documentNumber: string,
  kind: "civil" | "criminal" | "trabalhista",
): Promise<BackgroundCheckLawsuit[]> {
  const response = await fetch(`${BACKGROUND_CHECK_BASE_URL}/background-check/lawsuits/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": apiKey,
    },
    body: JSON.stringify({ documentNumber, pagination: { cursor: "", size: 100 } }),
  });

  if (!response.ok) {
    throw new Error(`JusBrasil (consulta ${kind} por CPF/CNPJ) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }

  const data = (await response.json()) as BackgroundCheckResponse;
  return Array.isArray(data.processos) ? data.processos : [];
}

// Roda as três frentes documentadas (cível, criminal, trabalhista) em
// paralelo. Uma integração pode não ter todos os produtos contratados —
// por isso uma falha isolada (ex.: 403 num produto não contratado) não
// derruba as outras; só propaga erro se TODAS falharem.
async function fetchDocumentLawsuits(apiKey: string, documentNumber: string): Promise<BackgroundCheckLawsuit[]> {
  const digits = documentNumber.replace(/\D/g, "") || documentNumber;
  const kinds: Array<"civil" | "criminal" | "trabalhista"> = ["civil", "criminal", "trabalhista"];
  const results = await Promise.allSettled(kinds.map((kind) => fetchBackgroundCheckLawsuits(apiKey, digits, kind)));

  const lawsuits: BackgroundCheckLawsuit[] = [];
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") lawsuits.push(...result.value);
    else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  }
  if (lawsuits.length === 0 && errors.length === results.length) {
    throw new Error(errors.join(" | "));
  }
  return lawsuits;
}

function buildBackgroundCheckSummary(item: BackgroundCheckLawsuit): string {
  const parts = [
    firstString(item.classe_processual, item.natureza),
    firstString(item.assunto),
    firstString(item.status?.normalizado, item.status?.inferido),
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) {
    return `Processo ${firstString(item.numero_processo) ?? "sem número identificado"} localizado via consulta por CPF/CNPJ.`;
  }
  return parts.join(" — ");
}

// Mapeia o formato real da resposta do background-check para o formato
// interno já consumido por extractProcessualData/extractDeadlines abaixo —
// evita reescrever o resto do pipeline (dedup, criação de caso, prazos,
// notificação) para cada fonte.
function normalizeBackgroundCheckLawsuit(item: BackgroundCheckLawsuit): JusbrasilProcessItem {
  return {
    ...item,
    numero_processo: firstString(item.numero_processo) ?? undefined,
    conteudo: buildBackgroundCheckSummary(item),
    data_publicacao: firstString(item.data_andamento_mais_recente, item.data_ultima_atualizacao) ?? undefined,
    vara: firstString(item.forum) ?? undefined,
    comarca: firstString(item.comarca) ?? undefined,
    valor_causa: item.valor_causa == null ? undefined : (firstNumber(item.valor_causa) ?? undefined),
  };
}

// ---------------------------------------------------------------------
// 2) Consulta por OAB — registro + listagem de vínculos (assíncrono)
// ---------------------------------------------------------------------

interface OabRegistrationResult {
  id?: string | number;
  correlation_id?: string;
  [key: string]: unknown;
}

interface OabLinkedProcess {
  id?: string | number;
  cnj?: string;
  cnj_id?: string | number;
  oab_id?: string | number;
  [key: string]: unknown;
}

// Formato esperado no cadastro (campo "OAB" na tela de Integrações, com
// placeholder "123456/SP"): número e seccional separados por "/" ou "-".
function parseOabInput(raw: string): { number: number; region: string } | null {
  const match = raw.trim().match(/^(\d+)\s*[/-]\s*([A-Za-z]{2})$/);
  if (!match) return null;
  return { number: Number(match[1]), region: match[2].toUpperCase() };
}

// Registra a OAB para monitoramento (idempotente do lado do provedor,
// segundo a documentação) e devolve o identificador (`id` ou
// `correlation_id`) necessário para consultar os vínculos depois — a
// documentação não deixa claro qual dos dois é sempre retornado, então
// aceitamos os dois.
async function ensureOabRegistered(apiKey: string, oab: { number: number; region: string }): Promise<string> {
  const response = await fetch(`${OAB_MONITORING_BASE_URL}/api/monitoramento/oab/acompanhamento/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify([{ name: "Monitoramento LexIA", number: oab.number, region: oab.region, is_active: true }]),
  });

  if (!response.ok) {
    throw new Error(`JusBrasil (registrar OAB para monitoramento) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }

  const data = await response.json();
  const entry: OabRegistrationResult | undefined = Array.isArray(data) ? data[0] : data;
  const identifier = entry?.id ?? entry?.correlation_id;
  if (identifier === undefined || identifier === null) {
    throw new Error("JusBrasil não retornou o identificador do cadastro de OAB (id/correlation_id ausente na resposta).");
  }
  return String(identifier);
}

// Lista os processos já vinculados à OAB monitorada. IMPORTANTE: essa
// listagem só traz o número do processo (CNJ) — a API de monitoramento por
// OAB não devolve conteúdo/movimentação/valor da causa. Além disso, o
// vínculo é processado de forma assíncrona pelo provedor: pode não haver
// nada disponível na primeira consulta logo após o cadastro, mesmo que a
// OAB esteja correta.
//
// TODO: para trazer conteúdo real (não só o número do processo) seria
// necessário, para cada CNJ novo encontrado aqui, uma chamada adicional a
// uma consulta processual por CNJ (produto separado, não coberto por esta
// correção) — hoje o item vira uma publicação "placeholder", suficiente
// para abrir o Caso e permitir consulta manual do processo pelo número,
// mas sem o teor da movimentação.
async function fetchOabLinkedProcesses(apiKey: string, oabRaw: string): Promise<JusbrasilProcessItem[]> {
  const oab = parseOabInput(oabRaw);
  if (!oab) {
    throw new Error(`Formato de OAB inválido: "${oabRaw}". Use o formato "123456/SP" (número/seccional).`);
  }

  const oabId = await ensureOabRegistered(apiKey, oab);

  const items: JusbrasilProcessItem[] = [];
  const perPage = 100;
  let page = 1;
  // Limite de segurança para nunca entrar num loop indefinido caso a API
  // devolva sempre uma página cheia por algum motivo inesperado.
  const maxPages = 50;

  while (page <= maxPages) {
    const url = new URL(`${OAB_MONITORING_BASE_URL}/api/monitoramento/oab/vinculos/processos/oab`);
    url.searchParams.set("oab_id", oabId);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${apiKey}`, "accept": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`JusBrasil (processos vinculados à OAB) respondeu ${response.status}: ${await response.text().catch(() => "")}`);
    }

    const data = await response.json();
    const rows: OabLinkedProcess[] = Array.isArray(data)
      ? data
      : (Array.isArray((data as { results?: unknown })?.results) ? (data as { results: OabLinkedProcess[] }).results : []);

    for (const row of rows) {
      const cnj = firstString(row.cnj);
      if (!cnj) continue;
      items.push({
        id: row.cnj_id !== undefined && row.cnj_id !== null ? String(row.cnj_id) : undefined,
        numero_processo: cnj,
        conteudo: `Processo vinculado à OAB ${oabRaw} — número identificado via monitoramento JusBrasil (conteúdo da movimentação não disponível por esta consulta).`,
      });
    }

    if (rows.length < perPage) break;
    page += 1;
  }

  return items;
}

// ---------------------------------------------------------------------
// Dispatcher + pipeline comum (dedup, caso, prazos, notificação, cobrança)
// ---------------------------------------------------------------------

async function fetchJusbrasilNewItems(apiKey: string, document: string | null, oab: string | null): Promise<JusbrasilProcessItem[]> {
  const items: JusbrasilProcessItem[] = [];
  const errors: string[] = [];

  if (document) {
    try {
      const lawsuits = await fetchDocumentLawsuits(apiKey, document);
      items.push(...lawsuits.map(normalizeBackgroundCheckLawsuit));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (oab) {
    try {
      items.push(...(await fetchOabLinkedProcesses(apiKey, oab)));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (items.length === 0 && errors.length > 0) {
    throw new Error(errors.join(" | "));
  }

  return items;
}

function extractProcessualData(item: JusbrasilProcessItem): ProcessualData {
  return {
    vara: firstString(item.vara, item.orgao_julgador, item.orgaoJulgador),
    comarca: firstString(item.comarca, item.municipio, item.foro),
    valor_causa: firstNumber(item.valor_causa, item.valorCausa, item.valor_da_causa),
    data_abertura_tribunal: firstDate(
      item.data_distribuicao,
      item.dataDistribuicao,
      item.data_abertura,
      item.dataAbertura,
    ),
    data_aceitacao: firstDate(item.data_aceitacao, item.dataAceitacao),
  };
}

function extractDeadlines(item: JusbrasilProcessItem): { external: string | null; internal: string | null } {
  return {
    external: firstDate(item.prazo_externo, item.prazoExterno, item.prazo, item.deadline),
    internal: firstDate(item.prazo_interno, item.prazoInterno),
  };
}

function detectDocumentType(document: string | null, oab: string | null): "cpf" | "cnpj" | "oab" | "outro" {
  if (document) {
    const digits = document.replace(/\D/g, "");
    if (digits.length === 11) return "cpf";
    if (digits.length === 14) return "cnpj";
  }
  if (oab) return "oab";
  return "outro";
}

async function recordSearchCharge(
  adminClient: AdminClient,
  integration: JusbrasilIntegration,
  searchType: "manual" | "poll",
): Promise<void> {
  const document = integration.monitor_document || integration.monitor_oab || "não informado";
  const unitPrice = integration.price_per_search ?? 0;

  const { error } = await adminClient.from("process_search_charges").insert({
    user_id: integration.user_id,
    integration_id: integration.id,
    source: "jusbrasil",
    document,
    document_type: detectDocumentType(integration.monitor_document, integration.monitor_oab),
    search_type: searchType,
    unit_price: unitPrice,
    charged_amount: unitPrice,
  });
  if (error) console.error("Error recording process search charge:", error);
}

export interface PollIntegrationResult {
  imported: number;
  error?: string;
}

// Executa a busca ativa para UMA integração: consulta a(s) API(s) real(is)
// (CPF/CNPJ e/ou OAB, conforme configurado), importa cada
// processo/movimentação novo como publicação (com dedup, dados
// processuais, prazo->evento na Agenda quando disponível e anexo
// automático do documento quando disponível) e sempre registra o uso no
// contador financeiro, com sucesso ou erro.
export async function pollJusbrasilIntegration(
  adminClient: AdminClient,
  integration: JusbrasilIntegration,
  searchType: "manual" | "poll",
): Promise<PollIntegrationResult> {
  if (!integration.api_key || (!integration.monitor_document && !integration.monitor_oab)) {
    return { imported: 0, error: "Configure a chave de API e o CPF/CNPJ ou OAB a monitorar antes de buscar." };
  }

  try {
    const items = await fetchJusbrasilNewItems(integration.api_key, integration.monitor_document, integration.monitor_oab);
    let imported = 0;

    for (const item of items) {
      const content = firstString(item.conteudo, item.resumo) || JSON.stringify(item).slice(0, 4000);
      const processNumber = firstString(item.numero_processo, item.processo);
      const publishedDateRaw = firstString(item.data_publicacao, item.data);
      const publishedDate = publishedDateRaw && !isNaN(new Date(publishedDateRaw).getTime())
        ? new Date(publishedDateRaw).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      // A consulta por CPF/CNPJ não usa cursor/timestamp incremental (traz
      // sempre o estado atual dos processos do documento) e a consulta por
      // OAB não tem um id de "evento" — sem um `item.id` reconhecido
      // (presente apenas na consulta por OAB, via cnj_id), um external_id
      // nulo faria a deduplicação não se aplicar e reimportaria o mesmo
      // item a cada execução — por isso, nesse caso, calculamos um id
      // determinístico a partir do conteúdo do próprio item (ver
      // _shared/externalId.ts).
      const externalId = firstString(item.id)
        ?? await computeFallbackExternalId(["jusbrasil", integration.user_id, processNumber, publishedDate, content.slice(0, 200)]);

      const processualData = extractProcessualData(item);
      const deadlines = extractDeadlines(item);

      const caseId = await findOrCreateCaseId(adminClient, integration.user_id, processNumber, processualData);

      const { data: inserted, error: insertError } = await adminClient
        .from("publications")
        .insert({
          user_id: integration.user_id,
          source: "jusbrasil",
          content,
          published_date: publishedDate,
          process_number: processNumber,
          case_id: caseId,
          external_id: externalId,
          external_deadline: deadlines.external,
          internal_deadline: deadlines.internal,
          raw_payload: item,
          imported_automatically: true,
          status: "pending",
          ...processualData,
        })
        .select("id")
        .maybeSingle();

      if (insertError && insertError.code !== "23505") {
        console.error("Error inserting polled publication:", insertError);
        continue;
      }
      if (inserted) {
        imported += 1;

        await syncDeadlineEvents(adminClient, integration.user_id, {
          id: inserted.id,
          case_id: caseId,
          process_number: processNumber,
          content,
          external_deadline: deadlines.external,
          internal_deadline: deadlines.internal,
        });
        await attachDocumentIfAvailable(adminClient, inserted.id, item);

        await adminClient.from("notifications").insert({
          user_id: integration.user_id,
          title: "Nova publicação importada via JusBrasil",
          message: processNumber
            ? `Processo ${processNumber}${caseId ? " — caso aberto automaticamente" : ""}`
            : content.slice(0, 140),
          link_tab: "publications",
        });
      }
    }

    await adminClient
      .from("publication_integrations")
      .update({
        last_received_at: imported > 0 ? new Date().toISOString() : undefined,
        last_poll_status: "ok",
        last_poll_error: null,
      })
      .eq("id", integration.id);

    await recordSearchCharge(adminClient, integration, searchType);

    return { imported };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error polling JusBrasil for user ${integration.user_id}:`, message);
    await adminClient
      .from("publication_integrations")
      .update({ last_poll_status: "error", last_poll_error: message.slice(0, 500) })
      .eq("id", integration.id);

    await recordSearchCharge(adminClient, integration, searchType);

    return { imported: 0, error: message };
  }
}
