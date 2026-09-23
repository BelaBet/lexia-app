// Sincroniza, para UM processo já importado, os detalhes que o provedor já
// tem em base (movimentações, partes, audiências, autos) — chamado
// automaticamente ao abrir a tela do processo (ver
// src/components/cases/JusbrasilCaseDetails.tsx) e manualmente pelo botão
// "Sincronizar detalhes". Lê só a fotografia já existente na base do
// provedor (endpoint base-judicial/tribproc) — NÃO usa atualiza_tribunal
// nem atualiza_tribunal_anexos, então não força uma consulta nova ao
// tribunal nem gera cobrança adicional.
//
// Cache de 24h: repetir a chamada sem `force` dentro desse intervalo não
// bate no provedor de novo, só devolve os números já salvos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br";

function cors(req: Request) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": configured.length ? (configured.includes(origin) ? origin : configured[0]) : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function getToken(admin: ReturnType<typeof createClient>) {
  const envToken = Deno.env.get("JUSBRASIL_API_TOKEN")?.trim();
  if (envToken) return envToken;
  const { data, error } = await admin.rpc("get_jusbrasil_api_token");
  if (error) throw new Error("Integração JusBrasil não configurada");
  const token = typeof data === "string" ? data.trim() : "";
  if (!token) throw new Error("Token JusBrasil ausente");
  return token;
}

Deno.serve(async (req) => {
  const ch = cors(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...ch, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: ch });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRole) return json({ error: "Configuração incompleta" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida" }, 401);

  let body: { case_id?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (!body.case_id) return json({ error: "case_id é obrigatório" }, 400);

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: result, error: resultError } = await admin.from("process_search_results")
    .select("*").eq("case_id", body.case_id).eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (resultError) return json({ error: "Erro ao carregar processo" }, 500);
  if (!result) return json({ error: "Processo não encontrado" }, 404);

  const existingRaw = result.raw_data && typeof result.raw_data === "object" ? result.raw_data as Record<string, unknown> : {};
  const cachedAt = typeof existingRaw._details_synced_at === "string" ? new Date(existingRaw._details_synced_at).getTime() : 0;
  if (!body.force && cachedAt && Date.now() - cachedAt < 24 * 60 * 60 * 1000) {
    return json({ success: true, cached: true, movements: Array.isArray(existingRaw.movs) ? existingRaw.movs.length : 0, autos: Array.isArray(existingRaw.anexos) ? existingRaw.anexos.length : 0 });
  }

  const cnj = String(result.process_number ?? "").trim();
  if (!cnj) return json({ error: "Número CNJ ausente" }, 400);

  let token: string;
  try { token = await getToken(admin); } catch (e) { return json({ error: e instanceof Error ? e.message : "Integração indisponível" }, 500); }

  // Lê apenas a fotografia já existente na base do provedor.
  // NÃO usa atualiza_tribunal nem atualiza_tribunal_anexos.
  const url = `${JUSBRASIL_API_BASE_URL}/api/base-judicial/tribproc/${encodeURIComponent(cnj)}?tipo_numero=5`;
  const provider = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" } });
  const txt = await provider.text();
  // deno-lint-ignore no-explicit-any
  let payload: any = null;
  try { payload = txt ? JSON.parse(txt) : null; } catch { payload = null; }
  if (!provider.ok || !payload || typeof payload !== "object") return json({ error: "Não foi possível sincronizar os detalhes já existentes do processo", provider_status: provider.status }, 502);

  const mergedRaw = { ...existingRaw, ...payload, _details_synced_at: new Date().toISOString(), _details_source: "base-judicial-cache" };
  const movs = Array.isArray(payload.movs) ? payload.movs : [];
  const anexos = Array.isArray(payload.anexos) ? payload.anexos : [];
  const audiencias = Array.isArray(payload.audiencias) ? payload.audiencias : [];
  const partes = Array.isArray(payload.partes) ? payload.partes : [];
  // deno-lint-ignore no-explicit-any
  const ativas = partes.filter((p: any) => p && (p.is_autora || p.is_coautora));
  // deno-lint-ignore no-explicit-any
  const passivas = partes.filter((p: any) => p && p.is_re);
  // deno-lint-ignore no-explicit-any
  const advogados = partes.flatMap((p: any) => Array.isArray(p?.advogados) ? p.advogados : []).filter(Boolean);
  const ultima = movs.length ? movs[0] : null;

  await admin.from("process_search_results").update({
    raw_data: mergedRaw,
    partes_ativas: ativas.length ? ativas : result.partes_ativas,
    partes_passivas: passivas.length ? passivas : result.partes_passivas,
    advogados: advogados.length ? advogados : result.advogados,
    comarca: payload.comarca ?? result.comarca,
    foro: payload.foro ?? result.foro,
    vara: payload.vara_original ?? payload.vara ?? result.vara,
    valor: payload.valor ?? result.valor,
    data_distribuicao: payload.distribuicaoData ?? result.data_distribuicao,
    ultima_movimentacao_data: ultima?.[0] ?? result.ultima_movimentacao_data,
    ultima_movimentacao_tipo: ultima?.[1] ?? result.ultima_movimentacao_tipo,
    ultima_movimentacao_texto: ultima?.[2] ?? result.ultima_movimentacao_texto,
    juiz: ultima?.[3] ?? payload.juiz ?? result.juiz,
    status_processual: payload.situacao ?? result.status_processual,
  }).eq("id", result.id);

  for (const item of anexos) {
    if (!Array.isArray(item)) continue;
    const sourceUrl = typeof item[1] === "string" ? item[1] : null;
    const title = typeof item[7] === "string" && item[7].trim() ? item[7].trim() : `Anexo ${item[0] ?? ""}`.trim();
    if (!sourceUrl) continue;
    const { data: exists } = await admin.from("process_search_documents").select("id").eq("result_id", result.id).eq("source_url", sourceUrl).maybeSingle();
    if (!exists) await admin.from("process_search_documents").insert({ result_id: result.id, user_id: user.id, file_name: title, file_path: sourceUrl, file_size: null, file_type: "application/pdf", source_url: sourceUrl });
  }

  return json({ success: true, cached: false, movements: movs.length, autos: anexos.length, hearings: audiencias.length, updated_at: mergedRaw._details_synced_at });
});
