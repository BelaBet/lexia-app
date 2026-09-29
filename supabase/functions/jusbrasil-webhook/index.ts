import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { findOrCreateCaseId, type ProcessualData } from "../_shared/findOrCreateCase.ts";
import { computeFallbackExternalId } from "../_shared/externalId.ts";
import { loadBlockedRanges } from "../_shared/businessDays.ts";
import { loadDeadlineRules, loadCaseType, classifyDeadline } from "../_shared/deadlineClassifier.ts";
import { syncDeadlineEvents } from "../_shared/syncPublicationExtras.ts";

interface JusbrasilEvent {
  id?: string | number;
  evt_type?: number;
  created_at?: string;
  target_number?: string;
  target_url?: string;
  source_url?: string[] | string;
  source_user_custom?: string;
  api_name?: string;
  data?: unknown;
  [key: string]: unknown;
}

type Destination = { user_id: string; integration_id: string | null };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sourceIntegrationIds(event: JusbrasilEvent): string[] {
  return Array.from(new Set(
    String(event.source_user_custom ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter((value) => isUuid(value)),
  ));
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstDate(...values: unknown[]): string {
  const raw = firstString(...values);
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}

// Diferente de firstDate(): quando não há nenhum candidato reconhecível,
// devolve null em vez de "hoje" — usada para campos processuais nuláveis
// (data_abertura_tribunal etc.) onde inventar uma data seria pior do que
// deixar em branco.
function firstNullableDate(...values: unknown[]): string | null {
  const raw = firstString(...values);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// Mesma heurística usada em publication-webhook/index.ts e
// _shared/pollJusbrasilIntegration.ts: aceita tanto "12.345,67" (BR) quanto
// "12345.67" (americano, como o JusBrasil já envia) sem inflar o valor em
// 100x quando ele já vem no segundo formato.
function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const raw = v.trim();
      const hasComma = raw.includes(",");
      const hasDot = raw.includes(".");
      let normalized: string;
      if (hasComma && hasDot) {
        const lastComma = raw.lastIndexOf(",");
        const lastDot = raw.lastIndexOf(".");
        normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
      } else if (hasComma) {
        normalized = raw.replace(/\./g, "").replace(",", ".");
      } else {
        normalized = raw;
      }
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

interface EventRow {
  content: string;
  date: string;
  processNumber: string | null;
  processualData: ProcessualData;
  raw: unknown;
  eventKey: string;
}

// Tuplas de movimentação: [data, título, detalhe, null, movement_id, ...].
// Usado tanto pelo evt_type 1 (data é a lista direto) quanto pelo snapshot
// completo do evt_type 13 (lista em data.movs — ver eventRows abaixo).
function movementTuplesToRows(
  tuples: unknown[],
  event: JusbrasilEvent,
  processNumber: string | null,
  processualData: ProcessualData,
): EventRow[] {
  return tuples
    .filter(Array.isArray)
    .map((movement) => {
      const tuple = movement as unknown[];
      const date = firstDate(tuple[0], event.created_at);
      const title = firstString(tuple[1]) ?? "Movimentação processual";
      const detail = firstString(tuple[2]);
      const movementId = firstString(tuple[4]) ?? date;
      return {
        content: detail ? `${title}: ${detail}` : title,
        date,
        processNumber,
        processualData,
        raw: { event, movement },
        eventKey: `mov-${movementId}`,
      };
    });
}

// Extrai o valor de um campo no formato Mongo extended JSON ({ "$date": ms }),
// usado pelo JusBrasil em published_at/available_at/detected_at.
function extractDateMs(value: unknown): number | null {
  if (value && typeof value === "object" && "$date" in (value as Record<string, unknown>)) {
    const raw = (value as Record<string, unknown>).$date;
    return typeof raw === "number" ? raw : null;
  }
  return null;
}

// Publicação no Diário Oficial (evt_type 2 confirmado) — cada item de
// `data` traz o teor integral do ato (`texto`), não uma tupla resumida.
function djenItemToRow(item: Record<string, unknown>, fallbackProcessNumber: string | null): EventRow {
  const processNumber = firstString(item.proc, fallbackProcessNumber);
  const content = firstString(item.texto, item.snippet)
    ?? "Publicação recebida do JusBrasil sem teor — ver anexo bruto.";
  const publishedMs = extractDateMs(item.published_at) ?? extractDateMs(item.available_at);
  const date = publishedMs
    ? new Date(publishedMs).toISOString().slice(0, 10)
    : firstDate();
  const idPart = firstString(item.recorte_id, item.source_id) ?? date;
  return {
    content,
    date,
    processNumber,
    processualData: { vara: firstString(item.secao_diario) },
    raw: item,
    eventKey: `djen-${idPart}`,
  };
}

function eventRows(event: JusbrasilEvent): EventRow[] {
  const processNumber = firstString(event.target_number);

  if (event.evt_type === 1 && Array.isArray(event.data)) {
    return movementTuplesToRows(event.data, event, processNumber, {});
  }

  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data)
    ? event.data as Record<string, unknown>
    : null;

  // Snapshot completo do processo (comum no evt_type 13, "Atualização
  // processual concluída"). Quando persistTribunalUpdate() não grava (ex.:
  // source_user_custom não aponta para um process_search_results existente
  // — processo vindo do monitoramento contínuo, não da busca avulsa), os
  // movimentos reais do payload eram descartados e só sobrava o rótulo
  // genérico abaixo. Aproveitamos os movimentos e os dados processuais de
  // verdade nesse caso.
  if (data && Array.isArray(data.movs) && data.movs.length > 0) {
    // "foro" é o texto legível ("VARA DO TRABALHO"); "vara"/"vara_original"
    // neste formato de snapshot são só um código numérico interno do
    // provedor (ex.: "3"), não o nome da vara.
    const processualData: ProcessualData = {
      vara: firstString(data.foro, data.vara_original, data.vara),
      comarca: firstString(data.comarca),
      valor_causa: firstNumber(data.valor),
      data_abertura_tribunal: firstNullableDate(data.distribuicaoData),
    };
    const dataProcessNumber = firstString(data.numero, data.numero_processo, data.process_number, data.cnj);
    return movementTuplesToRows(data.movs, event, processNumber ?? dataProcessNumber, processualData);
  }

  // Publicação no Diário Oficial (evt_type 2) — `data` é um array de
  // objetos com o teor integral do ato, não tuplas de movimento.
  if (Array.isArray(event.data) && event.data.some(
    (item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).texto === "string",
  )) {
    return (event.data as Record<string, unknown>[])
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .map((item) => djenItemToRow(item, processNumber));
  }

  const dataProcessNumber = data ? firstString(data.numero, data.numero_processo, data.process_number, data.cnj) : null;
  const resolvedProcess = processNumber ?? dataProcessNumber;
  const label = event.evt_type === 4
    ? "Nova distribuição localizada pelo JusBrasil"
    : event.evt_type === 13
      ? "Atualização processual concluída pelo JusBrasil"
      : event.evt_type === 18
        ? "Resultado de monitoramento de OAB recebido do JusBrasil"
        : `Evento JusBrasil tipo ${event.evt_type ?? "desconhecido"}`;

  return [{
    content: label,
    date: firstDate(event.created_at, data?.distribuicaoData, data?.data_distribuicao),
    processNumber: resolvedProcess,
    processualData: {},
    raw: event,
    eventKey: `evt-${event.id ?? event.evt_type ?? "unknown"}`,
  }];
}

async function resolveDestinations(
  admin: ReturnType<typeof createClient>,
  event: JusbrasilEvent,
): Promise<Destination[]> {
  // Atualização sob demanda de um processo: id_update_callback recebe o ID
  // de process_search_results. O evento 13 volta com esse valor em
  // source_user_custom, permitindo rotear sem depender de integration_id.
  if (event.evt_type === 13 && isUuid(String(event.source_user_custom ?? ""))) {
    const { data: result } = await admin
      .from("process_search_results")
      .select("user_id")
      .eq("id", String(event.source_user_custom))
      .maybeSingle();
    if (result?.user_id) return [{ user_id: result.user_id, integration_id: null }];
  }

  const integrationIds = sourceIntegrationIds(event);

  if (integrationIds.length > 0) {
    const { data, error } = await admin
      .from("publication_integrations")
      .select("id, user_id")
      .in("id", integrationIds)
      .eq("source", "jusbrasil")
      .eq("is_active", true);

    if (error) {
      console.error("jusbrasil-webhook: erro ao resolver source_user_custom", error);
      return [];
    }

    return (data ?? []).map((row) => ({ user_id: row.user_id, integration_id: row.id }));
  }

  if (!event.target_number) return [];

  const { data, error } = await admin
    .from("cases")
    .select("user_id")
    .eq("case_number", event.target_number);

  if (error) {
    console.error("jusbrasil-webhook: erro no fallback por CNJ", error);
    return [];
  }

  const owners = Array.from(new Set((data ?? []).map((row) => row.user_id).filter(Boolean)));
  if (owners.length !== 1) {
    console.warn("jusbrasil-webhook: fallback por CNJ recusado por ambiguidade", {
      target_number: event.target_number,
      possible_owners: owners.length,
    });
    return [];
  }

  return [{ user_id: owners[0], integration_id: null }];
}

async function persistTribunalUpdate(
  admin: ReturnType<typeof createClient>,
  event: JusbrasilEvent,
): Promise<void> {
  if (event.evt_type !== 13 || !isUuid(String(event.source_user_custom ?? ""))) return;
  const payload = event.data && typeof event.data === "object" && !Array.isArray(event.data)
    ? event.data as Record<string, unknown>
    : null;
  if (!payload) return;

  const resultId = String(event.source_user_custom);
  const { data: result, error } = await admin
    .from("process_search_results")
    .select("*")
    .eq("id", resultId)
    .maybeSingle();
  if (error || !result) return;

  const existingRaw = result.raw_data && typeof result.raw_data === "object" && !Array.isArray(result.raw_data)
    ? result.raw_data as Record<string, unknown>
    : {};
  const movs = Array.isArray(payload.movs) ? payload.movs as unknown[][] : [];
  const anexos = Array.isArray(payload.anexos) ? payload.anexos as unknown[][] : [];
  const ultima = movs.length ? movs[0] : null;
  const completedAt = new Date().toISOString();

  const { error: updateError } = await admin.from("process_search_results").update({
    raw_data: {
      ...existingRaw,
      ...payload,
      _details_synced_at: completedAt,
      _details_source: "tribunal-update-callback",
      _tribunal_updated_at: completedAt,
    },
    comarca: payload.comarca ?? result.comarca,
    foro: payload.foro ?? result.foro,
    vara: payload.vara_original ?? payload.vara ?? result.vara,
    valor: payload.valor ?? result.valor,
    data_distribuicao: payload.distribuicaoData ?? result.data_distribuicao,
    ultima_movimentacao_data: ultima?.[0] ?? result.ultima_movimentacao_data,
    ultima_movimentacao_tipo: ultima?.[1] ?? result.ultima_movimentacao_tipo,
    ultima_movimentacao_texto: ultima?.[2] ?? result.ultima_movimentacao_texto,
    juiz: payload.juiz ?? result.juiz,
    status_processual: payload.situacao ?? result.status_processual,
  }).eq("id", resultId);
  if (updateError) {
    console.error("jusbrasil-webhook: erro ao persistir atualização do tribunal", updateError);
    return;
  }

  for (const item of anexos) {
    if (!Array.isArray(item)) continue;
    const sourceUrl = typeof item[1] === "string" ? item[1] : null;
    if (!sourceUrl) continue;
    const title = typeof item[7] === "string" && item[7].trim() ? item[7].trim() : `Anexo ${item[0] ?? ""}`.trim();
    const { data: exists } = await admin.from("process_search_documents")
      .select("id").eq("result_id", resultId).eq("source_url", sourceUrl).maybeSingle();
    if (!exists) {
      await admin.from("process_search_documents").insert({
        result_id: resultId,
        user_id: result.user_id,
        file_name: title,
        file_path: sourceUrl,
        file_size: null,
        file_type: "application/pdf",
        source_url: sourceUrl,
      });
    }
  }
}

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const events = Array.isArray(body) ? body as JusbrasilEvent[] : [body as JusbrasilEvent];

  // Handshake oficial do JusBrasil ao cadastrar a URL: POST com [].
  if (events.length === 0) {
    return json({ success: true, received: 0, imported: 0, unrouted: 0 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Configuração do Supabase ausente" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  let expectedSecret = Deno.env.get("JUSBRASIL_WEBHOOK_API_NAME")?.trim() || null;

  // Preferimos Vault para manter toda a configuração centralizada na Lex IA.
  if (!expectedSecret) {
    const { data, error } = await admin.rpc("get_jusbrasil_webhook_api_name");
    if (!error && typeof data === "string" && data.trim()) expectedSecret = data.trim();
  }

  if (!expectedSecret) {
    return json({ error: "Webhook JusBrasil ainda não habilitado no backend" }, 503);
  }

  const requestSecret = new URL(req.url).searchParams.get("token");
  const authenticatedByUrl = requestSecret === expectedSecret;
  const authenticatedByApiName = events.every((event) => event.api_name === expectedSecret);

  // O JusBrasil não suporta cabeçalho de autenticação customizado para o
  // webhook. A Lex aceita o segredo central na URL configurada no provedor
  // e também aceita api_name quando ele estiver disponível na user_company.
  if (!authenticatedByUrl && !authenticatedByApiName) {
    return json({ error: "Origem do webhook não reconhecida" }, 401);
  }

  let imported = 0;
  let unrouted = 0;
  const deadlineRules = await loadDeadlineRules(admin);

  for (const event of events) {
    await persistTribunalUpdate(admin, event);
    const destinations = await resolveDestinations(admin, event);

    if (destinations.length === 0) {
      unrouted += 1;
      console.warn("jusbrasil-webhook: evento sem destino seguro", {
        evt_type: event.evt_type,
        target_number: event.target_number,
        has_source_user_custom: Boolean(event.source_user_custom),
      });
      continue;
    }

    for (const destination of destinations) {
      const blockedRanges = await loadBlockedRanges(admin, destination.user_id);

      for (const row of eventRows(event)) {
        const caseId = await findOrCreateCaseId(admin, destination.user_id, row.processNumber, row.processualData);
        const externalId = await computeFallbackExternalId([
          "jusbrasil-central-webhook",
          destination.user_id,
          event.id,
          row.eventKey,
          row.processNumber,
          row.date,
        ]);

        // Classificação automática do ato processual (complementar) — ver
        // _shared/deadlineClassifier.ts.
        const caseType = await loadCaseType(admin, caseId);
        const classification = classifyDeadline(row.content, caseType, row.date, deadlineRules, blockedRanges);

        const { data: inserted, error } = await admin
          .from("publications")
          .insert({
            user_id: destination.user_id,
            source: "jusbrasil",
            content: row.content,
            published_date: row.date,
            process_number: row.processNumber,
            vara: row.processualData.vara ?? null,
            comarca: row.processualData.comarca ?? null,
            valor_causa: row.processualData.valor_causa ?? null,
            data_abertura_tribunal: row.processualData.data_abertura_tribunal ?? null,
            case_id: caseId,
            external_id: externalId,
            raw_payload: row.raw,
            imported_automatically: true,
            status: "pending",
            classified_area: classification?.area ?? null,
            classified_act_name: classification?.actName ?? null,
            classified_deadline: classification?.deadline ?? null,
            classified_deadline_unit: classification?.deadlineUnit ?? null,
            classified_needs_review: classification?.needsReview ?? false,
            classified_rule_note: classification?.ruleNote ?? null,
          })
          .select("id")
          .maybeSingle();

        if (error && error.code !== "23505") {
          console.error("jusbrasil-webhook: erro ao inserir publicação", error);
          continue;
        }
        if (inserted) {
          imported += 1;
          await syncDeadlineEvents(admin, destination.user_id, {
            id: inserted.id,
            case_id: caseId,
            process_number: row.processNumber,
            content: row.content,
            external_deadline: null,
            internal_deadline: null,
            classified_deadline: classification?.deadline ?? null,
            classified_act_name: classification?.actName ?? null,
            classified_needs_review: classification?.needsReview ?? false,
          });
        }
      }

      if (destination.integration_id) {
        const { error } = await admin
          .from("publication_integrations")
          .update({ last_received_at: new Date().toISOString() })
          .eq("id", destination.integration_id)
          .eq("user_id", destination.user_id);
        if (error) console.error("jusbrasil-webhook: erro ao atualizar last_received_at", error);
      }
    }
  }

  return json({ success: true, received: events.length, imported, unrouted });
});
