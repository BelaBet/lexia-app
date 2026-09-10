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

  let body: { name?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const name = (body.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 3) return json({ error: "Informe um nome com pelo menos 3 letras" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: integrations, error: integrationError } = await admin
    .from("publication_integrations")
    .select("id, linked_client_id")
    .eq("user_id", user.id)
    .eq("source", "jusbrasil")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (integrationError) return json({ error: "Erro ao carregar integração JusBrasil" }, 500);
  const integration = integrations?.find((x) => !x.linked_client_id) ?? integrations?.[0] ?? null;
  if (!integration) return json({ error: "Ative a integração JusBrasil antes de pesquisar." }, 400);

  const { data: tokenData, error: tokenError } = await admin.rpc("get_jusbrasil_api_token");
  const token = typeof tokenData === "string" ? tokenData.trim() : "";
  if (tokenError || !token) return json({ error: "Integração JusBrasil não configurada no backend" }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const createResponse = await fetch(`${API}/api/relatorio-judicial/live_report_def/create_update_from_terms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      terms: { persons: [{ included: name }] },
      name: `LEXIA - ${name}`,
      distribuido_from: "1990-01-01",
      distribuido_to: today,
    }),
  });
  const createText = await createResponse.text().catch(() => "");
  if (!createResponse.ok) return json({ error: `JusBrasil não conseguiu preparar a prévia (${createResponse.status}).`, detail: createText.slice(0, 500) }, 502);

  const providerReportId = createText.trim().replace(/^"|"$/g, "");
  if (!providerReportId) return json({ error: "JusBrasil não retornou o id da prévia." }, 502);

  const previewResponse = await fetch(`${API}/api/relatorio-judicial/live_report_def/${providerReportId}/preview_totals`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const previewText = await previewResponse.text().catch(() => "");
  if (!previewResponse.ok) return json({ error: `JusBrasil não conseguiu gerar a prévia (${previewResponse.status}).`, detail: previewText.slice(0, 500) }, 502);

  let preview: any;
  try { preview = JSON.parse(previewText); } catch { return json({ error: "Prévia do JusBrasil em formato inválido." }, 502); }

  const totalProcs = Number(preview?.total_procs ?? 0) || 0;
  const estimatedCost = Number(preview?.total_cost ?? 0) || 0;
  const parts = Array.isArray(preview?.partes) ? preview.partes : [];

  const { data: report, error: insertError } = await admin
    .from("process_search_reports")
    .insert({
      user_id: user.id,
      integration_id: integration.id,
      search_name: name,
      jusbrasil_report_id: providerReportId,
      status: "preview",
      result_count: totalProcs,
      preview_data: preview,
      estimated_cost: estimatedCost,
      outcome_message: totalProcs > 0
        ? `Prévia encontrada: ${totalProcs} processo(s). Revise as variações antes de confirmar.`
        : "Prévia concluída sem processos para os critérios atuais.",
    })
    .select("id")
    .single();
  if (insertError || !report) return json({ error: "Não foi possível registrar a prévia na LEXIA." }, 500);

  const normalizedParts = parts.map((p: any) => ({
    id: p?.id ?? null,
    name: p?.nome ?? name,
    checked: p?.checked !== false,
    total: Number(p?.total_procs_variacoes ?? p?.parte_max_total ?? 0) || 0,
    variations: Array.isArray(p?.variacoes)
      ? p.variacoes.map((v: any[]) => ({ name: v?.[0] ?? "", total: Number(v?.[1] ?? v?.[2] ?? 0) || 0, variation_id: v?.[3] ?? null, checked: v?.[4] !== false })).filter((v: any) => v.name)
      : [],
  }));

  return json({
    success: true,
    report_id: report.id,
    provider_report_id: providerReportId,
    search_name: name,
    total_procs: totalProcs,
    estimated_cost: estimatedCost,
    parts: normalizedParts,
    message: totalProcs > 0 ? `Encontramos ${totalProcs} processo(s) na prévia.` : "Nenhum processo encontrado na prévia.",
  });
});
