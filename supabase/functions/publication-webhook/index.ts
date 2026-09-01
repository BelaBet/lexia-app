// Recebe notificações (webhook) de provedores externos de monitoramento de
// publicações/processos — hoje: JusBrasil (API Dossiê) e WebJur — e importa
// automaticamente cada nova publicação/demanda para a tela de Rastreamento
// de Publicações do usuário dono da integração, criando também uma
// notificação in-app.
//
// URL de configuração no provedor externo (JusBrasil/WebJur), usando a URL
// do próprio projeto Supabase (a mesma usada nas outras edge functions):
//   https://<seu-projeto>.supabase.co/functions/v1/publication-webhook/<user_id>?source=jusbrasil
//   https://<seu-projeto>.supabase.co/functions/v1/publication-webhook/<user_id>?source=webjur
//
// Autenticação: cada usuário gera, na tela de Integrações, um segredo de
// webhook próprio (tabela publication_integrations). O provedor deve enviar
// esse valor no header `x-webhook-secret` (ou como querystring `?secret=...`,
// para provedores que não suportam headers customizados). A função só grava
// dados na conta do usuário se o segredo bater.
//
// IMPORTANTE: o formato exato do corpo (JSON) enviado pelo JusBrasil e pelo
// WebJur pode variar conforme o plano/endpoint contratado. Este handler faz
// uma extração "best effort" dos campos mais prováveis (conteúdo, número do
// processo, data) e sempre guarda o payload bruto em `raw_payload` — assim,
// mesmo que algum campo específico não seja reconhecido automaticamente,
// nenhuma informação é perdida e o registro pode ser ajustado manualmente na
// tela de Publicações. Quando houver acesso à conta real do provedor, revise
// os nomes de campo abaixo (marcados com TODO) contra um payload de exemplo
// real e ajuste o mapeamento.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

type PublicationSource = "jusbrasil" | "webjur" | "escavador" | "manual" | "outro";

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function extractPublicationDate(payload: Record<string, unknown>): string {
  // TODO: confirmar o nome real do campo de data quando houver payload de exemplo.
  const raw = firstString(
    payload.data_publicacao,
    payload.published_date,
    payload.data,
    payload.date,
    (payload.publicacao as Record<string, unknown> | undefined)?.data,
  );
  if (raw) {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function extractContent(payload: Record<string, unknown>): string {
  // TODO: confirmar o nome real do campo de conteúdo/teor quando houver payload de exemplo.
  const content = firstString(
    payload.conteudo,
    payload.content,
    payload.texto,
    payload.resumo,
    payload.description,
    payload.summary,
  );
  if (content) return content;
  // Fallback: nenhum campo reconhecido — guarda o JSON bruto como conteúdo
  // para não perder a informação, para revisão manual depois.
  try {
    return JSON.stringify(payload).slice(0, 4000);
  } catch {
    return "Publicação importada automaticamente (conteúdo não reconhecido, ver dados brutos).";
  }
}

function extractProcessNumber(payload: Record<string, unknown>): string | null {
  return firstString(
    payload.numero_processo,
    payload.process_number,
    payload.processo,
    payload.numeroProcesso,
    (payload.processo as Record<string, unknown> | undefined)?.numero,
  );
}

function extractExternalId(payload: Record<string, unknown>): string | null {
  return firstString(
    payload.id,
    payload.publicacao_id,
    payload.movimentacao_id,
    payload.event_id,
    payload.uuid,
  );
}

const sourceLabels: Record<string, string> = {
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
  // O user_id vem como o último segmento do path após o nome da função:
  // /publication-webhook/<user_id>
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
  if (!providedSecret) {
    return json({ error: "Segredo do webhook ausente" }, 401);
  }

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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const externalId = extractExternalId(payload);
  const content = extractContent(payload);
  const publishedDate = extractPublicationDate(payload);
  const processNumber = extractProcessNumber(payload);

  const { data: inserted, error: insertError } = await adminClient
    .from("publications")
    .insert({
      user_id: userId,
      source,
      content,
      published_date: publishedDate,
      process_number: processNumber,
      external_id: externalId,
      raw_payload: payload,
      imported_automatically: true,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  // Reenvio do mesmo evento pelo provedor (mesmo external_id) não é erro —
  // apenas confirma recebimento sem duplicar o registro.
  if (insertError && insertError.code !== "23505") {
    console.error("Error inserting publication from webhook:", insertError);
    return json({ error: "Erro ao gravar publicação" }, 500);
  }

  await adminClient
    .from("publication_integrations")
    .update({ last_received_at: new Date().toISOString() })
    .eq("id", integration.id);

  if (inserted) {
    const { error: notifError } = await adminClient.from("notifications").insert({
      user_id: userId,
      title: `Nova publicação importada via ${sourceLabels[source] || source}`,
      message: processNumber ? `Processo ${processNumber}` : content.slice(0, 140),
      link_tab: "publications",
    });
    if (notifError) console.error("Error creating notification:", notifError);
  }

  return json({ success: true, duplicated: !inserted });
});
