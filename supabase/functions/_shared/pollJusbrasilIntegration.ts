// Lógica de busca ativa no JusBrasil para UMA integração — compartilhada
// entre poll-jusbrasil (roda para todas as integrações ativas, 1x/dia via
// pg_cron) e manual-process-search (dispara a busca para uma única
// integração, sob demanda, pelo botão "Buscar agora" na tela de
// Integrações). Mantendo a lógica num só lugar, os dois fluxos não podem
// divergir.
//
// Também é responsável por registrar o "contador financeiro de pesquisas
// processuais": toda vez que esta função roda para uma integração — venha
// de busca ativa agendada ou de busca manual — grava um registro em
// process_search_charges usando o valor configurado em
// publication_integrations.price_per_search (0 quando não configurado).

import { findOrCreateCaseId, ProcessualData } from "./findOrCreateCase.ts";
import { syncDeadlineEvents, attachDocumentIfAvailable } from "./syncPublicationExtras.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

// TODO: confirmar com a documentação da conta JusBrasil ativa (Consulta
// Processual / Distribuição). Estrutura provável, a ajustar:
const JUSBRASIL_API_BASE_URL = "https://api.jusbrasil.com.br";

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

async function fetchJusbrasilNewItems(apiKey: string, document: string | null, oab: string | null): Promise<JusbrasilProcessItem[]> {
  // TODO: substituir pelo endpoint real assim que confirmado (ex:
  // `${JUSBRASIL_API_BASE_URL}/v1/processos/consulta` ou similar). O corpo
  // abaixo é uma tentativa razoável baseada na documentação pública
  // (busca por CPF/CNPJ ou por OAB), mas precisa validação com um payload
  // de exemplo real.
  const query: Record<string, string> = {};
  if (document) query.documento = document;
  if (oab) query.oab = oab;

  const response = await fetch(`${JUSBRASIL_API_BASE_URL}/v1/processos/consulta`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    throw new Error(`JusBrasil respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }

  const data = await response.json();
  // Tenta reconhecer os formatos mais prováveis de lista de resultados.
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.processos)) return data.processos;
  if (Array.isArray(data?.data)) return data.data;
  return [];
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

function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string" && v.trim().length > 0) {
      // Aceita tanto "12345.67" quanto formato brasileiro "12.345,67".
      const normalized = v.trim().replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

// Extrai os dados processuais destacados no sistema (vara, comarca, valor da
// causa, data de abertura no tribunal e data de aceitação) a partir do item
// retornado pela API do JusBrasil. Os nomes de campo abaixo são uma tentativa
// razoável baseada nos termos mais comuns usados por consultas processuais —
// TODO: confirmar/ajustar contra um payload de exemplo real assim que houver
// acesso à conta ativa.
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

// Extrai os prazos externo e interno, quando a API já os fornecer, para que
// os eventos correspondentes já nasçam na Agenda junto com a publicação —
// TODO: confirmar os nomes de campo reais quando houver payload de exemplo.
function extractDeadlines(item: JusbrasilProcessItem): { external: string | null; internal: string | null } {
  return {
    external: firstDate(item.prazo_externo, item.prazoExterno, item.prazo, item.deadline),
    internal: firstDate(item.prazo_interno, item.prazoInterno),
  };
}

// Identifica o tipo do documento monitorado só para fins de exibição no
// contador financeiro (não afeta a busca em si).
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

// Executa a busca ativa para UMA integração: consulta a API, importa cada
// processo/movimentação novo como publicação (com dedup, dados processuais,
// prazo->evento na Agenda e anexo automático do documento quando disponível)
// e sempre registra o uso no contador financeiro, com sucesso ou erro.
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
      const externalId = firstString(item.id);
      const content = firstString(item.conteudo, item.resumo) || JSON.stringify(item).slice(0, 4000);
      const processNumber = firstString(item.numero_processo, item.processo);
      const publishedDateRaw = firstString(item.data_publicacao, item.data);
      const publishedDate = publishedDateRaw && !isNaN(new Date(publishedDateRaw).getTime())
        ? new Date(publishedDateRaw).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

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
