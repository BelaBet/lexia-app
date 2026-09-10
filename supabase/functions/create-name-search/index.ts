// Inicia uma busca de processos por NOME no JusBrasil — ação manual e paga.
// A credencial do provedor é central da LEXIA e nunca fica exposta por tenant.
// Respostas de negócio como "nenhum processo encontrado" são tratadas como
// resultado vazio, e não como falha técnica.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br";

function buildCorsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = req.headers.get("Origin") ?? req.headers.get("origin") ?? "";
  const allowOrigin = configured.length > 0
    ? (configured.includes(requestOrigin) ? requestOrigin : configured[0])
    : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

class ProviderError extends Error {
  status: number;
  body: string;
  stage: "criar_relatorio" | "iniciar_busca";
  constructor(stage: "criar_relatorio" | "iniciar_busca", status: number, body: string) {
    super(`JusBrasil (${stage === "criar_relatorio" ? "criar relatório" : "iniciar busca"}) respondeu ${status}: ${body}`);
    this.name = "ProviderError";
    this.stage = stage;
    this.status = status;
    this.body = body;
  }
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isNoResultsResponse(status: number, body: string) {
  if (status !== 403 && status !== 404 && status !== 422) return false;
  const text = normalize(body);
  return (
    text.includes("nao identificamos processos") ||
    text.includes("nenhum processo encontrado") ||
    text.includes("nenhum processo foi encontrado") ||
    text.includes("nao foram encontrados processos")
  );
}

async function providerText(response: Response) {
  const body = await response.text().catch(() => "");
  return body.slice(0, 2000);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Configuração do Supabase ausente" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const name = (body.name ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length < 3) {
    return json({ error: "Informe um nome com pelo menos 3 letras" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: integrations, error: integrationError } = await adminClient
    .from("publication_integrations")
    .select("id, price_per_name_search, linked_client_id")
    .eq("user_id", user.id)
    .eq("source", "jusbrasil")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (integrationError) {
    console.error("create-name-search integration error", integrationError);
    return json({ error: "Erro ao carregar integração JusBrasil" }, 500);
  }

  const integration = integrations?.find((item) => !item.linked_client_id) ?? integrations?.[0] ?? null;
  if (!integration) {
    return json({ error: "Ative a integração JusBrasil antes de buscar por nome." }, 400);
  }

  const { data: tokenData, error: tokenError } = await adminClient.rpc("get_jusbrasil_api_token");
  const apiToken = typeof tokenData === "string" ? tokenData.trim() : "";
  if (tokenError || !apiToken) {
    console.error("create-name-search token error", tokenError?.message ?? "token vazio");
    return json({ error: "Integração JusBrasil não configurada no backend" }, 500);
  }

  const { data: report, error: insertError } = await adminClient
    .from("process_search_reports")
    .insert({
      user_id: user.id,
      integration_id: integration.id,
      search_name: name,
      status: "criando",
    })
    .select("id")
    .single();

  if (insertError || !report) {
    console.error("create-name-search report insert error", insertError);
    return json({ error: "Erro ao registrar a busca" }, 500);
  }

  let providerReportId: string | null = null;

  try {
    const createResponse = await fetch(
      `${JUSBRASIL_API_BASE_URL}/api/relatorio-judicial/live_report_def/create_update_from_terms`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          terms: { persons: [{ included: name }] },
          name: `Busca: ${name}`,
        }),
      },
    );

    const createBody = await providerText(createResponse);
    if (!createResponse.ok) {
      if (isNoResultsResponse(createResponse.status, createBody)) {
        await adminClient
          .from("process_search_reports")
          .update({
            status: "concluido",
            result_count: 0,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", report.id);

        return json({
          success: true,
          no_results: true,
          report_id: report.id,
          message: "Busca concluída: nenhum processo foi encontrado para o nome informado.",
        });
      }
      throw new ProviderError("criar_relatorio", createResponse.status, createBody);
    }

    providerReportId = createBody.trim().replace(/^"|"$/g, "");
    if (!providerReportId) throw new Error("JusBrasil não retornou o id do relatório criado.");

    const billingResponse = await fetch(
      `${JUSBRASIL_API_BASE_URL}/api/relatorio-judicial/live_report_def/${providerReportId}/bill_start_update`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    const billingBody = await providerText(billingResponse);
    if (!billingResponse.ok) {
      if (isNoResultsResponse(billingResponse.status, billingBody)) {
        await adminClient
          .from("process_search_reports")
          .update({
            jusbrasil_report_id: providerReportId,
            status: "concluido",
            result_count: 0,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", report.id);

        return json({
          success: true,
          no_results: true,
          report_id: report.id,
          message: "Busca concluída: nenhum processo foi encontrado para o nome informado.",
        });
      }
      throw new ProviderError("iniciar_busca", billingResponse.status, billingBody);
    }

    await adminClient
      .from("process_search_reports")
      .update({
        jusbrasil_report_id: providerReportId,
        status: "processando",
        billed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", report.id);

    const unitPrice = integration.price_per_name_search ?? 0;
    const { error: chargeError } = await adminClient.from("process_search_charges").insert({
      user_id: user.id,
      integration_id: integration.id,
      source: "jusbrasil",
      document: name,
      document_type: "nome",
      search_type: "busca_nome",
      unit_price: unitPrice,
      charged_amount: unitPrice,
    });
    if (chargeError) console.error("create-name-search charge log error", chargeError);

    return json({
      success: true,
      no_results: false,
      report_id: report.id,
      message: "Busca iniciada. O JusBrasil pode levar até 72 horas para concluir — você pode verificar o resultado depois.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("create-name-search provider error", message);

    await adminClient
      .from("process_search_reports")
      .update({
        jusbrasil_report_id: providerReportId,
        status: "erro",
        error_message: message.slice(0, 500),
      })
      .eq("id", report.id);

    return json({
      error: "Não foi possível concluir a busca no JusBrasil. A LEXIA permaneceu estável e você pode tentar novamente mais tarde.",
      detail: message.slice(0, 500),
    }, 502);
  }
});
