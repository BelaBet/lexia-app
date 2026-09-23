// Núcleo do "sincronizar detalhes do processo" — busca a fotografia já
// existente na base do provedor (endpoint base-judicial/tribproc, NÃO
// atualiza_tribunal nem atualiza_tribunal_anexos — sem custo/consulta nova
// ao tribunal) e atualiza process_search_results + process_search_documents.
// Compartilhado entre sync-case-details (chamada manual/automática ao abrir
// a tela do processo, por usuário) e sync-all-case-details (varredura
// diária via pg_cron, todos os processos).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br";

export interface ProcessSearchResultRow {
  id: string;
  case_id?: string | null;
  user_id: string;
  process_number: string | null;
  raw_data: unknown;
  partes_ativas?: unknown;
  partes_passivas?: unknown;
  advogados?: unknown;
  comarca?: string | null;
  foro?: string | null;
  vara?: string | null;
  valor?: number | null;
  data_distribuicao?: string | null;
  ultima_movimentacao_data?: string | null;
  ultima_movimentacao_tipo?: string | null;
  ultima_movimentacao_texto?: string | null;
  juiz?: string | null;
  status_processual?: string | null;
}

export async function getJusbrasilToken(admin: SupabaseClient): Promise<string> {
  const envToken = Deno.env.get("JUSBRASIL_API_TOKEN")?.trim();
  if (envToken) return envToken;
  const { data, error } = await admin.rpc("get_jusbrasil_api_token");
  if (error) throw new Error("Integração JusBrasil não configurada");
  const token = typeof data === "string" ? data.trim() : "";
  if (!token) throw new Error("Token JusBrasil ausente");
  return token;
}

export interface SyncCaseDetailsResult {
  cached: boolean;
  movements: number;
  autos: number;
  hearings: number;
  updated_at?: string;
}

// Cache de 24h por processo (salvo com force=true): dentro desse intervalo
// não bate no provedor de novo, só devolve os números já salvos.
export async function syncCaseDetails(
  admin: SupabaseClient,
  result: ProcessSearchResultRow,
  token: string,
  force: boolean,
): Promise<SyncCaseDetailsResult> {
  const existingRaw = result.raw_data && typeof result.raw_data === "object" ? result.raw_data as Record<string, unknown> : {};
  const cachedAt = typeof existingRaw._details_synced_at === "string" ? new Date(existingRaw._details_synced_at).getTime() : 0;
  if (!force && cachedAt && Date.now() - cachedAt < 24 * 60 * 60 * 1000) {
    return {
      cached: true,
      movements: Array.isArray(existingRaw.movs) ? existingRaw.movs.length : 0,
      autos: Array.isArray(existingRaw.anexos) ? existingRaw.anexos.length : 0,
      hearings: Array.isArray(existingRaw.audiencias) ? existingRaw.audiencias.length : 0,
    };
  }

  const cnj = String(result.process_number ?? "").trim();
  if (!cnj) throw new Error("Número CNJ ausente");

  const url = `${JUSBRASIL_API_BASE_URL}/api/base-judicial/tribproc/${encodeURIComponent(cnj)}?tipo_numero=5`;
  const provider = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" } });
  const txt = await provider.text();
  // deno-lint-ignore no-explicit-any
  let payload: any = null;
  try { payload = txt ? JSON.parse(txt) : null; } catch { payload = null; }
  if (!provider.ok || !payload || typeof payload !== "object") {
    throw new Error(`Não foi possível sincronizar os detalhes já existentes do processo (status ${provider.status})`);
  }

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
    if (!exists) {
      await admin.from("process_search_documents").insert({
        result_id: result.id,
        user_id: result.user_id,
        file_name: title,
        file_path: sourceUrl,
        file_size: null,
        file_type: "application/pdf",
        source_url: sourceUrl,
      });
    }
  }

  return { cached: false, movements: movs.length, autos: anexos.length, hearings: audiencias.length, updated_at: mergedRaw._details_synced_at as string };
}
