// Lógica de busca ativa no JusBrasil para UMA integração — compartilhada
// entre poll-jusbrasil (roda para todas as integrações ativas, 1x/dia via
// pg_cron) e manual-process-search (dispara a busca para uma única
// integração, sob demanda, pelo botão "Buscar agora" na tela de
// Integrações). Mantendo a lógica num só lugar, os dois fluxos não podem
// divergir.
//
// CORREÇÃO (pedido explícito, confirmado contra
// https://api.jusbrasil.com.br/docs/autenticacao/api_key.html e o restante
// da documentação): o contrato do JusBrasil usado aqui NÃO faz busca por
// CPF/CNPJ — só por NOME ou RAZÃO SOCIAL. A versão anterior deste arquivo
// (correção do BUG-001) implementava um endpoint de "Consulta processual
// por CPF/CNPJ" (background-check, host api.jusbrasil.com.br) que, embora
// documentado, exige um contrato "Consulta PRO" separado que este cliente
// não tem — na prática a busca por CPF/CNPJ nunca retornava nada. Esse
// caminho foi REMOVIDO. A busca por nome/razão social agora usa o mesmo
// produto já validado e testado no CRM de Busca de Processos
// (_shared/jusbrasilNameSearch.ts — "Consulta Processual por Nome" /
// relatorio_nome, host op.digesto.com.br, Authorization: Bearer).
//
// ENDPOINTS REAIS usados por este arquivo:
//
// 1) Consulta por NOME/RAZÃO SOCIAL ("Consulta Processual por Nome" —
//    relatorio_nome): assíncrona, paga por "encomenda" (bill_start_update).
//    Fluxo: cria/atualiza a definição do relatório uma única vez
//    (create_update_from_terms, guardamos o id em
//    publication_integrations.jusbrasil_report_id para reaproveitar),
//    encomenda o processamento (bill_start_update — só quando fizer sentido
//    cobrar, ver comentário em ensureNameSearchReport) e lê o que já estiver
//    pronto via export. Pode levar até 72h para novos processos aparecerem
//    (docs: relatorio_nome/index.html).
//
// 2) Consulta por OAB ("Busca de processos por OAB"): host
//    `https://op.digesto.com.br`, autenticação via
//    `Authorization: Bearer <token>`. Também assíncrona: é preciso primeiro
//    registrar a OAB para monitoramento
//    (POST /api/monitoramento/oab/acompanhamento/) e só depois consultar os
//    processos já vinculados a ela
//    (GET /api/monitoramento/oab/vinculos/processos/oab) — o vínculo de
//    processos novos é processado de forma assíncrona pelo provedor (pode
//    não haver nada na primeira consulta, mesmo com a OAB correta). A API
//    só devolve o número do processo (CNJ) vinculado, sem o
//    conteúdo/movimentação em si — para isso ainda seria necessário uma
//    consulta processual adicional por CNJ, que este arquivo não faz (fica
//    fora do escopo desta correção; ver TODO em fetchOabLinkedProcesses).
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
import { createNameSearchReport, startNameSearchBilling, fetchNameSearchExport, NameSearchRow } from "./jusbrasilNameSearch.ts";
import { loadBlockedRanges, adjustDeadlineToNextBusinessDay } from "./businessDays.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

type AdminClient = SupabaseClient;

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
  monitor_name: string | null;
  monitor_oab: string | null;
  jusbrasil_report_id?: string | null;
  price_per_search?: number | null;
  // Cliente (public.clients) a vincular automaticamente a qualquer processo
  // encontrado por esta integração — ver migration
  // 20260905040000_link_client_to_jusbrasil_search.sql (fluxo "Novo Cliente").
  linked_client_id?: string | null;
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
// 1) Consulta por NOME/RAZÃO SOCIAL — relatório assíncrono (reaproveita o
//    mesmo cliente já usado pelo CRM de Busca de Processos)
// ---------------------------------------------------------------------

// Garante que existe um relatório no JusBrasil para o nome/razão social
// configurado, reaproveitando o id já salvo em vez de criar um novo a cada
// execução (criar de novo com o mesmo `id` apenas atualiza os termos —
// mas não há necessidade de repetir a chamada todo dia se o nome não
// mudou). Retorna o id do relatório e se ele acabou de ser criado agora.
async function ensureNameSearchReport(
  adminClient: AdminClient,
  integration: JusbrasilIntegration,
  name: string,
): Promise<{ reportId: string; justCreated: boolean }> {
  if (integration.jusbrasil_report_id) {
    return { reportId: integration.jusbrasil_report_id, justCreated: false };
  }

  const { reportId } = await createNameSearchReport(integration.api_key as string, name, `Busca ativa: ${name}`);

  const { error } = await adminClient
    .from("publication_integrations")
    .update({ jusbrasil_report_id: reportId })
    .eq("id", integration.id);
  if (error) console.error("Error saving jusbrasil_report_id:", error);

  // Mantém em memória para o restante desta execução (a integração passada
  // pode ser reutilizada pelo chamador depois de retornar).
  integration.jusbrasil_report_id = reportId;

  return { reportId, justCreated: true };
}

// Busca por nome é PAGA por "encomenda" (bill_start_update) — encomendar
// todo dia, sem o usuário saber, cobraria da conta JusBrasil dele
// silenciosamente. Por isso:
//   - busca MANUAL ("Buscar agora"): sempre encomenda uma atualização —
//     é uma ação deliberada da pessoa, ela espera que isso tenha custo.
//   - busca agendada (poll diário): só LÊ o que já estiver pronto no
//     relatório (export), sem encomendar nada novo — nunca gera cobrança
//     sozinha. Para builds novos, a pessoa ainda precisa clicar em
//     "Buscar agora" pelo menos uma vez (ou no futuro, se desejado, um
//     toggle explícito de "atualização automática paga" poderia ligar
//     isso — fora do escopo desta correção).
async function fetchNameSearchNewItems(
  adminClient: AdminClient,
  integration: JusbrasilIntegration,
  name: string,
  searchType: "manual" | "poll",
): Promise<JusbrasilProcessItem[]> {
  const { reportId, justCreated } = await ensureNameSearchReport(adminClient, integration, name);

  if (searchType === "manual" || justCreated) {
    await startNameSearchBilling(integration.api_key as string, reportId);
  }

  const rows = await fetchNameSearchExport(integration.api_key as string, reportId);
  if (rows === null) return []; // ainda processando no JusBrasil (até 72h) — não é erro

  return rows.map(normalizeNameSearchRow);
}

// Mapeia o NameSearchRow (formato interno do CRM de busca por nome) para o
// formato consumido pelo restante deste pipeline (dedup, criação de processo,
// prazos, notificação) — evita duplicar a lógica de normalização de coluna
// já corrigida em _shared/jusbrasilNameSearch.ts.
function buildNameSearchSummary(row: NameSearchRow): string {
  const parts = [
    firstString(row.natureza, row.area),
    firstString(row.status_processual),
    row.ultima_movimentacao_tipo ? `Última mov.: ${row.ultima_movimentacao_tipo}` : null,
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) {
    return `Processo ${row.process_number ?? "sem número identificado"} localizado via busca por nome/razão social.`;
  }
  return parts.join(" — ");
}

function normalizeNameSearchRow(row: NameSearchRow): JusbrasilProcessItem {
  return {
    numero_processo: row.process_number ?? undefined,
    conteudo: buildNameSearchSummary(row),
    data_publicacao: row.ultima_movimentacao_data ?? row.data_distribuicao ?? undefined,
    vara: row.vara ?? undefined,
    comarca: row.comarca ?? undefined,
    foro: row.foro ?? undefined,
    valor_causa: row.valor ?? undefined,
    data_distribuicao: row.data_distribuicao ?? undefined,
    prazo_externo: undefined,
    raw_data: row.raw_data,
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
// para abrir o Processo e permitir consulta manual do processo pelo número,
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
// Dispatcher + pipeline comum (dedup, processo, prazos, notificação, cobrança)
// ---------------------------------------------------------------------

async function fetchJusbrasilNewItems(
  adminClient: AdminClient,
  integration: JusbrasilIntegration,
  searchType: "manual" | "poll",
): Promise<JusbrasilProcessItem[]> {
  const items: JusbrasilProcessItem[] = [];
  const errors: string[] = [];

  if (integration.monitor_name) {
    try {
      items.push(...(await fetchNameSearchNewItems(adminClient, integration, integration.monitor_name, searchType)));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (integration.monitor_oab) {
    try {
      items.push(...(await fetchOabLinkedProcesses(integration.api_key as string, integration.monitor_oab)));
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

function detectDocumentType(name: string | null, oab: string | null): "nome" | "razao_social" | "oab" | "outro" {
  if (name) return "nome";
  if (oab) return "oab";
  return "outro";
}

async function recordSearchCharge(
  adminClient: AdminClient,
  integration: JusbrasilIntegration,
  searchType: "manual" | "poll",
): Promise<void> {
  const document = integration.monitor_name || integration.monitor_oab || "não informado";
  const unitPrice = integration.price_per_search ?? 0;

  const { error } = await adminClient.from("process_search_charges").insert({
    user_id: integration.user_id,
    integration_id: integration.id,
    source: "jusbrasil",
    document,
    document_type: detectDocumentType(integration.monitor_name, integration.monitor_oab),
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
// (nome/razão social e/ou OAB, conforme configurado), importa cada
// processo/movimentação novo como publicação (com dedup, dados
// processuais, prazo->evento na Agenda quando disponível e anexo
// automático do documento quando disponível) e sempre registra o uso no
// contador financeiro, com sucesso ou erro.
export async function pollJusbrasilIntegration(
  adminClient: AdminClient,
  integration: JusbrasilIntegration,
  searchType: "manual" | "poll",
): Promise<PollIntegrationResult> {
  if (!integration.api_key || (!integration.monitor_name && !integration.monitor_oab)) {
    return { imported: 0, error: "Configure a chave de API e o nome/razão social ou OAB a monitorar antes de buscar." };
  }

  try {
    const items = await fetchJusbrasilNewItems(adminClient, integration, searchType);
    let imported = 0;

    // Prazo "priorizado": carrega os bloqueios/feriados aplicáveis a esta
    // conta uma única vez por execução (globais + os que o próprio
    // escritório cadastrou) e usa para corrigir cada prazo recebido cru da
    // API antes de gravar — ver _shared/businessDays.ts.
    const blockedRanges = await loadBlockedRanges(adminClient, integration.user_id);

    for (const item of items) {
      const content = firstString(item.conteudo, item.resumo) || JSON.stringify(item).slice(0, 4000);
      const processNumber = firstString(item.numero_processo, item.processo);
      const publishedDateRaw = firstString(item.data_publicacao, item.data);
      const publishedDate = publishedDateRaw && !isNaN(new Date(publishedDateRaw).getTime())
        ? new Date(publishedDateRaw).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      // Nem a busca por nome/razão social nem a busca por OAB têm um id de
      // "evento" incremental (a por nome não usa cursor/timestamp — traz o
      // estado atual do relatório; a por OAB só tem o cnj_id do vínculo,
      // que já é usado como `item.id` quando disponível). Sem um `item.id`
      // reconhecido, um external_id nulo faria a deduplicação não se
      // aplicar e reimportaria o mesmo item a cada execução — por isso,
      // nesse caso, calculamos um id determinístico a partir do conteúdo do
      // próprio item (ver _shared/externalId.ts).
      const externalId = firstString(item.id)
        ?? await computeFallbackExternalId(["jusbrasil", integration.user_id, processNumber, publishedDate, content.slice(0, 200)]);

      const processualData = extractProcessualData(item);
      const rawDeadlines = extractDeadlines(item);
      // Corrige o prazo cru da API para o próximo dia útil quando cair em
      // feriado/recesso/fim de semana (CPC art. 224 §1º) — o que aparece na
      // Agenda já é o prazo real, prorrogado corretamente.
      const deadlines = {
        external: adjustDeadlineToNextBusinessDay(rawDeadlines.external, blockedRanges),
        internal: adjustDeadlineToNextBusinessDay(rawDeadlines.internal, blockedRanges),
      };

      const caseId = await findOrCreateCaseId(adminClient, integration.user_id, processNumber, processualData);

      // Fluxo "Novo Cliente": quando esta integração já nasceu vinculada a
      // um cliente (busca feita a partir do cadastro do cliente, antes de
      // qualquer processo existir), vincula automaticamente todo processo
      // encontrado a esse cliente — sem isso o advogado teria que abrir o
      // processo depois e convidar o cliente manualmente de novo.
      if (caseId && integration.linked_client_id) {
        const { error: linkError } = await adminClient
          .from("case_clients")
          .upsert({ case_id: caseId, client_id: integration.linked_client_id }, { onConflict: "case_id,client_id", ignoreDuplicates: true });
        if (linkError) console.error("Error auto-linking case to client:", linkError);
      }

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
            ? `Processo ${processNumber}${caseId ? " — processo aberto automaticamente" : ""}`
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
