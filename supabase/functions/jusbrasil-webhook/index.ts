import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { findOrCreateCaseId } from "../_shared/findOrCreateCase.ts";
import { computeFallbackExternalId } from "../_shared/externalId.ts";

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

function eventRows(event: JusbrasilEvent): Array<{
  content: string;
  date: string;
  processNumber: string | null;
  raw: unknown;
  eventKey: string;
}> {
  const processNumber = firstString(event.target_number);

  if (event.evt_type === 1 && Array.isArray(event.data)) {
    return (event.data as unknown[])
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
          raw: { event, movement },
          eventKey: `mov-${movementId}`,
        };
      });
  }

  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data)
    ? event.data as Record<string, unknown>
    : {};
  const dataProcessNumber = firstString(data.numero, data.numero_processo, data.process_number, data.cnj);
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
    date: firstDate(event.created_at, data.distribuicaoData, data.data_distribuicao),
    processNumber: resolvedProcess,
    raw: event,
    eventKey: `evt-${event.id ?? event.evt_type ?? "unknown"}`,
  }];
}

async function resolveDestinations(
  admin: ReturnType<typeof createClient>,
  event: JusbrasilEvent,
): Promise<Destination[]> {
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

  for (const event of events) {
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
      for (const row of eventRows(event)) {
        const caseId = await findOrCreateCaseId(admin, destination.user_id, row.processNumber);
        const externalId = await computeFallbackExternalId([
          "jusbrasil-central-webhook",
          destination.user_id,
          event.id,
          row.eventKey,
          row.processNumber,
          row.date,
        ]);

        const { data: inserted, error } = await admin
          .from("publications")
          .insert({
            user_id: destination.user_id,
            source: "jusbrasil",
            content: row.content,
            published_date: row.date,
            process_number: row.processNumber,
            case_id: caseId,
            external_id: externalId,
            raw_payload: row.raw,
            imported_automatically: true,
            status: "pending",
          })
          .select("id")
          .maybeSingle();

        if (error && error.code !== "23505") {
          console.error("jusbrasil-webhook: erro ao inserir publicação", error);
          continue;
        }
        if (inserted) imported += 1;
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
