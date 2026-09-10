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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sourceIntegrationIds(event: JusbrasilEvent): string[] {
  return String(event.source_user_custom ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => isUuid(v));
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

function eventRows(event: JusbrasilEvent): Array<{ content: string; date: string; processNumber: string | null; raw: unknown; eventKey: string }> {
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

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let body: unknown;
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const events = Array.isArray(body) ? body as JusbrasilEvent[] : [body as JusbrasilEvent];

  // O JusBrasil testa a URL com um array vazio. Este teste deve funcionar
  // mesmo antes da ativação do api_name, e não toca banco nem provedor.
  if (events.length === 0) return json({ success: true, received: 0, imported: 0 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const expectedApiName = Deno.env.get("JUSBRASIL_WEBHOOK_API_NAME")?.trim();
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);
  if (!expectedApiName) return json({ error: "Webhook JusBrasil ainda não habilitado no backend" }, 503);

  if (events.some((event) => event.api_name !== expectedApiName)) {
    return json({ error: "Origem do webhook não reconhecida" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  let imported = 0;
  let unrouted = 0;

  for (const event of events) {
    const integrationIds = sourceIntegrationIds(event);
    let destinations: Array<{ user_id: string; integration_id: string | null }> = [];

    if (integrationIds.length > 0) {
      const { data } = await admin
        .from("publication_integrations")
        .select("id, user_id")
        .in("id", integrationIds)
        .eq("source", "jusbrasil")
        .eq("is_active", true);
      destinations = (data ?? []).map((row) => ({ user_id: row.user_id, integration_id: row.id }));
    }

    if (destinations.length === 0 && event.target_number) {
      const { data } = await admin
        .from("cases")
        .select("user_id")
        .eq("case_number", event.target_number);
      destinations = Array.from(new Set((data ?? []).map((row) => row.user_id)))
        .map((user_id) => ({ user_id, integration_id: null }));
    }

    if (destinations.length === 0) {
      unrouted += 1;
      console.warn("jusbrasil-webhook: evento sem destino", { evt_type: event.evt_type, target_number: event.target_number });
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
        await admin.from("publication_integrations")
          .update({ last_received_at: new Date().toISOString() })
          .eq("id", destination.integration_id);
      }
    }
  }

  return json({ success: true, received: events.length, imported, unrouted });
});
