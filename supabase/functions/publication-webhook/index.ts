// Recebe notificações (webhook) de provedores externos de monitoramento de
// publicações/processos — JusBrasil (API Dossê), WebJur e Escavador — e
// importa automaticamente cada nova publicação/movimentação para a tela de
// Rastreamento de Publicações do usuário dono da integração, criando
// também uma notificação in-app.
//
// URL de configuração no provedor externo, usando a URL do próprio projeto
// Supabase (a mesma usada nas outras edge functions):
//   https://<seu-projeto>.supabase.co/functions/v1/publication-webhook/<user_id>?source=jusbrasil
//   https://<seu-projeto>.supabase.co/functions/v1/publication-webhook/<user_id>?source=webjur
//   https://<seu-projeto>.supabase.co/functions/v1/publication-webhook/<user_id>?source=escavador
//
// Autenticação: cada usuário gera, na tela de Integrações, um segredo de
// webhook próprio (tabela publication_integrations). O provedor deve enviar
// esse valor no header `x-webhook-secret` (ou como querystring `?secret=...`,
// para provedores que não suportam headers customizados). A função só grava
// dados na conta do usuário se o segredo bater.
//
// IMPORTANTE — formato do JusBrasil (Monitoramento de Processos), já
// confirmado contra a documentação oficial: o corpo do webhook é um ARRAY
// de "envelopes" de evento, um por movimentação/atualização:
//   [{ target_number, evt_type, created_at, target_url, source_url, data }, ...]
// Quando evt_type === 1 (movimentação), `data` é um array de tuplas
// [data, título, detalhe|null, null, movement_id, [[x,y]], instância?] — cada
// tupla vira UMA publicação separada (um webhook costuma trazer ~12 eventos
// de uma vez). Outros evt_type (ex.: 8 = monitorado suspenso) ainda não têm
// o formato de `data` totalmente documentado — nesses casos guardamos o
// envelope inteiro em raw_payload para revisão manual, sem perder a
// informação.
//
// WebJur e Escavador continuam com extração "best effort" a partir de um
// objeto único (formato exato não confirmado — TODOs abaixo), guardando
// sempre o payload bruto em `raw_payload`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { findOrCreateCaseId, ProcessualData } from "../_shared/findOrCreateCase.ts";
import { syncDeadlineEvents, attachDocumentIfAvailable } from "../_shared/syncPublicationExtras.ts";
import { computeFallbackExternalId } from "../_shared/externalId.ts";

type PublicationSource = "jusbrasil" | "webjur" | "escavador";

interface PublicationRow {
  content: string;
  publishedDate: string;
  processNumber: string | null;
  externalId: string;
  processualData?: ProcessualData;
  externalDeadline?: string | null;
  internalDeadline?: string | null;
  rawPayload: unknown;
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

// Mesma heurística de _shared/pollJusbrasilIntegration.ts: aceita tanto
// "12.345,67" (BR) quanto "12345.67" (americano/JSON) sem inflar o valor em
// 100x quando ele já vem no segundo formato.
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

// ---- JusBrasil (Monitoramento): array de envelopes de evento ----

interface JusbrasilEventEnvelope {
  target_number?: string;
  evt_type?: number;
  created_at?: string;
  target_url?: string;
  source_url?: string;
  data?: unknown;
  [key: string]: unknown;
}

function extractJusbrasilMovementRows(envelope: JusbrasilEventEnvelope): PublicationRow[] {
  const processNumber = firstString(envelope.target_number);
  const movements = Array.isArray(envelope.data) ? (envelope.data as unknown[]) : [];
  const rows: PublicationRow[] = [];

  for (const movement of movements) {
    if (!Array.isArray(movement)) continue;
    const [date, title, detail, , movementId] = movement as [string, string, string | null, unknown, string | number];
    const titlePart = firstString(title) ?? "Movimentação";
    const detailPart = firstString(detail);
    const content = detailPart ? `${titlePart}: ${detailPart}` : titlePart;
    const publishedDate = firstDate(date) ?? new Date().toISOString().slice(0, 10);
    const externalId = `${processNumber ?? "sem-processo"}-${firstString(movementId) ?? publishedDate}`;

    rows.push({
      content,
      publishedDate,
      processNumber,
      externalId,
      rawPayload: { envelope, movement },
    });
  }

  return rows;
}

function extractJusbrasilFallbackRow(envelope: JusbrasilEventEnvelope): PublicationRow {
  const processNumber = firstString(envelope.target_number);
  const publishedDate = firstDate(envelope.created_at) ?? new Date().toISOString().slice(0, 10);
  return {
    content: `Evento JusBrasil (tipo ${envelope.evt_type ?? "desconhecido"}) — revisar manualmente.`,
    publishedDate,
    processNumber,
    externalId: `${processNumber ?? "sem-processo"}-evt${envelope.evt_type ?? "?"}-${publishedDate}`,
    rawPayload: envelope,
  };
}

// ---- WebJur / Escavador: objeto único, extração "best effort" ----

function extractGenericRow(payload: Record<string, unknown>): Omit<PublicationRow, "externalId"> {
  // TODO: confirmar os nomes de campo reais quando houver payload de
  // exemplo do provedor (WebJur/Escavador).
  const content = firstString(
    payload.conteudo, payload.content, payload.texto, payload.resumo, payload.description, payload.summary,
  ) ?? (() => {
    try { return JSON.stringify(payload).slice(0, 4000); }
    catch { return "Publicação importada automaticamente (conteúdo não reconhecido, ver dados brutos)."; }
  })();

  const recognizedDate = firstDate(
    payload.data_publicacao, payload.published_date, payload.data, payload.date,
    (payload.publicacao as Record<string, unknown> | undefined)?.data,
  );
  // Quando o payload não traz um campo de data reconhecido, usamos a data
  // de hoje só para satisfazer a coluna NOT NULL — isso NÃO é a data real
  // da publicação. Marcamos `_date_estimated` no raw_payload (ver uso mais
  // abaixo) para que isso fique auditável em vez de silenciosamente
  // indistinguível de uma data real, já que pode afetar ordenação, prazos e
  // relatórios por período.
  const dateEstimated = recognizedDate === null;
  const publishedDate = recognizedDate ?? new Date().toISOString().slice(0, 10);
  if (dateEstimated) {
    console.warn("publication-webhook: nenhuma data reconhecida no payload — usando data de importação como estimativa.");
  }

  const processNumber = firstString(
    payload.numero_processo, payload.process_number, payload.processo, payload.numeroProcesso,
    (payload.processo as Record<string, unknown> | undefined)?.numero,
  );

  const processualData: ProcessualData = {
    vara: firstString(payload.vara, payload.orgao_julgador, payload.orgaoJulgador),
    comarca: firstString(payload.comarca, payload.municipio, payload.foro),
    valor_causa: firstNumber(payload.valor_causa, payload.valorCausa, payload.valor_da_causa),
    data_abertura_tribunal: firstDate(payload.data_distribuicao, payload.dataDistribuicao, payload.data_abertura, payload.dataAbertura),
    data_aceitacao: firstDate(payload.data_aceitacao, payload.dataAceitacao),
  };

  const externalDeadline = firstDate(payload.prazo_externo, payload.prazoExterno, payload.prazo, payload.deadline);
  const internalDeadline = firstDate(payload.prazo_interno, payload.prazoInterno);

  const rawPayload = dateEstimated ? { ...payload, _date_estimated: true } : payload;

  return { content, publishedDate, processNumber, processualData, externalDeadline, internalDeadline, rawPayload };
}

function extractGenericExternalId(payload: Record<string, unknown>): string | null {
  return firstString(payload.id, payload.publicacao_id, payload.movimentacao_id, payload.event_id, payload.uuid);
}

const sourceLabels: Record<PublicationSource, string> = {
  jusbrasil: "JusBrasil",
  webjur: "WebJur",
  escavador: "Escavador",
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "content-type, x-webhook-secret", "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const userId = pathParts[pathParts.length - 1];
  const sourceParam = (url.searchParams.get("source") || "").toLowerCase();

  if (!userId || userId === "publication-webhook") {
    return json({ error: "user_id ausente na URL do webhook" }, 400);
  }
  if (sourceParam !== "jusbrasil" && sourceParam !== "webjur" && sourceParam !== "escavador") {
    return json({ error: "Parâmetro ?source= inválido (use jusbrasil, webjur ou escavador)" }, 400);
  }
  const source = sourceParam as PublicationSource;

  const providedSecret = req.headers.get("x-webhook-secret") || url.searchParams.get("secret") || "";
  if (!providedSecret) return json({ error: "Segredo do webhook ausente" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: integration, error: integrationError } = await adminClient
    .from("publication_integrations")
    .select("id, webhook_secret, is_active")
    .eq("user_id", userId)
    .eq("source", source)
    .maybeSingle();

  if (integrationError) {
    console.error("Error loading publication_integrations:", integrationError);
    return json({ error: "Erro ao validar integração" }, 500);
  }
  if (!integration || !integration.is_active || integration.webhook_secret !== providedSecret) {
    return json({ error: "Não autorizado" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  // Monta a lista de linhas de publicação a importar, dependendo da fonte.
  const rows: PublicationRow[] = [];

  if (source === "jusbrasil") {
    const envelopes: JusbrasilEventEnvelope[] = Array.isArray(rawBody)
      ? (rawBody as JusbrasilEventEnvelope[])
      : [rawBody as JusbrasilEventEnvelope];

    for (const envelope of envelopes) {
      if (envelope?.evt_type === 1) {
        rows.push(...extractJusbrasilMovementRows(envelope));
      } else {
        rows.push(extractJusbrasilFallbackRow(envelope));
      }
    }
  } else {
    const payload = (Array.isArray(rawBody) ? rawBody[0] : rawBody) as Record<string, unknown>;
    const generic = extractGenericRow(payload ?? {});
    const externalId = extractGenericExternalId(payload ?? {})
      ?? await computeFallbackExternalId(["publication-webhook", source, userId, generic.processNumber, generic.publishedDate, generic.content.slice(0, 200)]);
    rows.push({ ...generic, externalId });
  }

  let imported = 0;

  for (const row of rows) {
    const caseId = await findOrCreateCaseId(adminClient, userId, row.processNumber, row.processualData);

    const { data: inserted, error: insertError } = await adminClient
      .from("publications")
      .insert({
        user_id: userId,
        source,
        content: row.content,
        published_date: row.publishedDate,
        process_number: row.processNumber,
        case_id: caseId,
        external_id: row.externalId,
        external_deadline: row.externalDeadline ?? null,
        internal_deadline: row.internalDeadline ?? null,
        raw_payload: row.rawPayload,
        imported_automatically: true,
        status: "pending",
        ...(row.processualData ?? {}),
      })
      .select("id")
      .maybeSingle();

    // Reenvio do mesmo evento pelo provedor (mesmo external_id) não é erro
    // — apenas confirma recebimento sem duplicar o registro.
    if (insertError && insertError.code !== "23505") {
      console.error("Error inserting publication from webhook:", insertError);
      continue;
    }
    if (inserted) {
      imported += 1;
      await syncDeadlineEvents(adminClient, userId, {
        id: inserted.id,
        case_id: caseId,
        process_number: row.processNumber,
        content: row.content,
        external_deadline: row.externalDeadline ?? null,
        internal_deadline: row.internalDeadline ?? null,
      });
      await attachDocumentIfAvailable(adminClient, inserted.id, (row.rawPayload ?? {}) as Record<string, unknown>);
    }
  }

  await adminClient
    .from("publication_integrations")
    .update({ last_received_at: new Date().toISOString() })
    .eq("id", integration.id);

  // Uma notificação consolidada por chamada de webhook (um webhook do
  // JusBrasil pode trazer ~12 eventos de uma vez — notificar um por um
  // seria spam).
  if (imported > 0) {
    const { error: notifError } = await adminClient.from("notifications").insert({
      user_id: userId,
      title: `${imported} nova(s) publicação(ões) importada(s) via ${sourceLabels[source]}`,
      message: rows[0]?.processNumber
        ? `Inclui o processo ${rows[0].processNumber}`
        : "Confira em Publicações.",
      link_tab: "publications",
    });
    if (notifError) console.error("Error creating notification:", notifError);
  }

  return json({ success: true, imported, received: rows.length });
});
