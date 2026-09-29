// Núcleo do sincronismo de detalhes. A abertura automática apenas lê a
// fotografia existente no provedor. Quando force=true (clique explícito do
// usuário), solicita atualização real no tribunal e usa o webhook tipo 13
// para receber e persistir o resultado concluído.
// Compartilhado entre sync-case-details (chamada manual/automática ao abrir
// a tela do processo, por usuário) e sync-all-case-details (varredura
// diária via pg_cron, todos os processos).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { dedupeLawyers, dedupeParties, isActiveParty, isPassiveParty, lawyersOf } from "./dedupeParties.ts";

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
  update_requested?: boolean;
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

  const params = new URLSearchParams({ tipo_numero: "5" });
  // id_update_callback já solicita a atualização no tribunal e faz o provedor
  // devolver o resultado final via evento 13. Não pedimos nova baixa de autos
  // aqui; isso permanece uma operação separada.
  if (force) params.set("id_update_callback", result.id);
  const url = `${JUSBRASIL_API_BASE_URL}/api/base-judicial/tribproc/${encodeURIComponent(cnj)}?${params.toString()}`;
  const provider = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" } });
  const txt = await provider.text();
  // deno-lint-ignore no-explicit-any
  let payload: any = null;
  try { payload = txt ? JSON.parse(txt) : null; } catch { payload = null; }
  if (!provider.ok || !payload || typeof payload !== "object") {
    throw new Error(`Não foi possível sincronizar os detalhes já existentes do processo (status ${provider.status})`);
  }

  const now = new Date().toISOString();
  const mergedRaw = {
    ...existingRaw,
    ...payload,
    _details_synced_at: now,
    _details_source: force ? "tribunal-update-requested" : "base-judicial-cache",
    ...(force ? { _tribunal_update_requested_at: now } : {}),
  };
  const movs = Array.isArray(payload.movs) ? payload.movs : [];
  const anexos = Array.isArray(payload.anexos) ? payload.anexos : [];
  const audiencias = Array.isArray(payload.audiencias) ? payload.audiencias : [];
  const partes = Array.isArray(payload.partes) ? payload.partes : [];
  // As partes chegam como tuplas ou objetos; os helpers aceitam os dois.
  const ativas = dedupeParties(partes.filter(isActiveParty));
  const passivas = dedupeParties(partes.filter(isPassiveParty));
  const advogados = dedupeLawyers(partes.flatMap(lawyersOf));
  const ultima = movs.length ? movs[0] : null;

  // CORRIGIDO (falso sucesso): nem o UPDATE de process_search_results nem
  // os INSERTs de process_search_documents abaixo verificavam o {error}
  // retornado — uma falha silenciosa (RLS, erro transitório) deixava a
  // função seguir e devolver um resultado de sucesso (movements/autos/
  // hearings contados a partir do payload já buscado do provedor) mesmo
  // que nada tivesse sido persistido no banco. Agora qualquer erro aqui
  // lança uma exceção, que os dois chamadores (sync-case-details e
  // sync-all-case-details) já tratam corretamente como falha.
  const { error: updateError } = await admin.from("process_search_results").update({
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
  if (updateError) throw new Error(`Falha ao salvar os detalhes sincronizados: ${updateError.message}`);

  for (const item of anexos) {
    if (!Array.isArray(item)) continue;
    const sourceUrl = typeof item[1] === "string" ? item[1] : null;
    const title = typeof item[7] === "string" && item[7].trim() ? item[7].trim() : `Anexo ${item[0] ?? ""}`.trim();
    if (!sourceUrl) continue;
    // CORRIGIDO: a URL assinada (item[1]) muda a cada consulta ao provedor
    // mesmo para o MESMO documento (Google Cloud Storage reassina a URL
    // com Signature/Expires novos a cada request) — deduplicar por
    // source_url fazia cada sincronização regravar os mesmos anexos como
    // "novos", duplicando a lista de autos indefinidamente a cada rodada
    // diária. O provedor traz um identificador estável na primeira posição
    // da tupla (item[0]); usamos ele para deduplicar de verdade.
    const providerId = item[0] !== undefined && item[0] !== null ? String(item[0]) : null;
    const dedupQuery = admin.from("process_search_documents").select("id").eq("result_id", result.id);
    const { data: exists, error: existsError } = await (
      providerId ? dedupQuery.eq("provider_document_id", providerId) : dedupQuery.eq("source_url", sourceUrl)
    ).maybeSingle();
    if (existsError) throw new Error(`Falha ao verificar anexo já registrado: ${existsError.message}`);
    if (!exists) {
      const { error: insertError } = await admin.from("process_search_documents").insert({
        result_id: result.id,
        user_id: result.user_id,
        file_name: title,
        file_path: sourceUrl,
        file_size: null,
        file_type: "application/pdf",
        source_url: sourceUrl,
        provider_document_id: providerId,
      });
      if (insertError) throw new Error(`Falha ao registrar anexo: ${insertError.message}`);
    } else if (providerId) {
      // O anexo já existe (mesmo provider_document_id) mas a URL assinada
      // mudou desde o último registro — atualiza o file_path/source_url
      // para o link válido mais recente, sem criar uma linha duplicada.
      const { error: updateDocError } = await admin.from("process_search_documents")
        .update({ file_path: sourceUrl, source_url: sourceUrl })
        .eq("id", exists.id);
      if (updateDocError) throw new Error(`Falha ao atualizar link do anexo: ${updateDocError.message}`);
    }
  }

  return { cached: false, movements: movs.length, autos: anexos.length, hearings: audiencias.length, updated_at: mergedRaw._details_synced_at as string, update_requested: force };
}
