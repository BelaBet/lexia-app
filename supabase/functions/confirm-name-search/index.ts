import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const API = "https://op.digesto.com.br";

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = cors(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { report_id?: string; confirm_charge?: boolean; excluded_variation_ids?: Array<number | null> };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (!body.report_id) return json({ error: "Prévia não informada" }, 400);
  if (body.confirm_charge !== true) return json({ error: "Confirmação da consulta paga obrigatória" }, 409);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: report, error: reportError } = await admin
    .from("process_search_reports")
    .select("id, user_id, integration_id, search_name, jusbrasil_report_id, status, preview_data, estimated_cost")
    .eq("id", body.report_id)
    .eq("user_id", user.id)
    .single();
  if (reportError || !report) return json({ error: "Prévia não encontrada" }, 404);
  if (report.status !== "preview") return json({ error: "Esta busca já foi confirmada ou encerrada." }, 409);
  if (!report.jusbrasil_report_id) return json({ error: "Prévia sem identificador do JusBrasil" }, 500);

  const { data: tokenData, error: tokenError } = await admin.rpc("get_jusbrasil_api_token");
  const token = typeof tokenData === "string" ? tokenData.trim() : "";
  if (tokenError || !token) return json({ error: "Integração JusBrasil não configurada no backend" }, 500);

  const excludedIds = Array.isArray(body.excluded_variation_ids) ? body.excluded_variation_ids : [];
  if (excludedIds.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const updateResponse = await fetch(`${API}/api/relatorio-judicial/live_report_def/create_update_from_terms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        id: Number(report.jusbrasil_report_id),
        name: `LEXIA - ${report.search_name}`,
        distribuido_from: "1990-01-01",
        distribuido_to: today,
        terms: { persons: [{ included: report.search_name, excluded_variacoes_ids: excludedIds }] },
      }),
    });
    if (!updateResponse.ok) {
      const detail = (await updateResponse.text().catch(() => "")).slice(0, 500);
      return json({ error: "Não foi possível aplicar a seleção de variações.", detail }, 502);
    }
  }

  const billResponse = await fetch(`${API}/api/relatorio-judicial/live_report_def/${report.jusbrasil_report_id}/bill_start_update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({}),
  });
  const billText = await billResponse.text().catch(() => "");
  if (!billResponse.ok) {
    const normalized = billText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (billResponse.status === 403 && normalized.includes("nao identificamos processos")) {
      await admin.from("process_search_reports").update({
        status: "concluido",
        result_count: 0,
        completed_at: new Date().toISOString(),
        outcome_message: "O JusBrasil não identificou processos após a seleção confirmada.",
        error_message: null,
      }).eq("id", report.id);
      return json({ success: true, no_results: true, report_id: report.id, message: "Nenhum processo foi identificado após a confirmação." });
    }
    return json({ error: `JusBrasil não conseguiu iniciar a busca (${billResponse.status}).`, detail: billText.slice(0, 500) }, 502);
  }

  await admin.from("process_search_reports").update({
    status: "processando",
    billed_at: new Date().toISOString(),
    outcome_message: "Busca confirmada e enviada ao JusBrasil para processamento.",
    error_message: null,
  }).eq("id", report.id);

  const { data: integration } = await admin
    .from("publication_integrations")
    .select("price_per_name_search")
    .eq("id", report.integration_id)
    .single();
  const unitPrice = integration?.price_per_name_search ?? 0;
  await admin.from("process_search_charges").insert({
    user_id: user.id,
    integration_id: report.integration_id,
    source: "jusbrasil",
    document: report.search_name,
    document_type: "nome",
    search_type: "busca_nome",
    unit_price: unitPrice,
    charged_amount: unitPrice,
  });

  return json({ success: true, report_id: report.id, message: "Busca confirmada e iniciada. O processamento pode levar até 72 horas." });
});
