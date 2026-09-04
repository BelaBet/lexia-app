// "Baixar autos" de um processo encontrado na busca por nome. Baixa os
// documentos/peças do JusBrasil e guarda no Storage (bucket privado
// process-search-documents).
//
// TRAVA DE DOWNLOAD: um processo só pode ter os autos baixados UMA vez por
// um usuário comum. Depois disso, autos_download_locked fica true e
// qualquer nova tentativa é bloqueada aqui (mesmo que o botão apareça de
// novo na tela por algum motivo) — só a função admin-unlock-autos-download,
// chamada por um admin/supremo, consegue destravar. As colunas de trava só
// podem ser alteradas pela service role (ver migração
// name_search_autos_download_lock), então mesmo um usuário tentando bater
// direto na tabela não consegue burlar isso.
//
// CONDIÇÃO DE CORRIDA (corrigido): antes, a checagem de "já travado?" era um
// SELECT separado do UPDATE que efetivamente trava — duas requisições quase
// simultâneas para o MESMO result_id podiam passar pela checagem antes que
// qualquer uma gravasse o bloqueio, e as duas baixavam os autos (documentos
// e cobranças duplicados, chamadas repetidas à API externa). A correção usa
// um UPDATE atômico com WHERE autos_download_locked = false AND
// autos_status <> 'solicitado' como "reserva" do direito de baixar: o
// Postgres serializa updates concorrentes na mesma linha, então só a
// primeira requisição encontra a condição satisfeita e recebe a linha de
// volta — a segunda recebe zero linhas afetadas e é rejeitada aqui, antes de
// chamar a API externa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { fetchCaseAutos } from "../_shared/jusbrasilNameSearch.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { result_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const resultId = body.result_id;
  if (!resultId) return json({ error: "result_id é obrigatório" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: result, error: resultError } = await adminClient
    .from("process_search_results")
    .select("id, user_id, process_number, autos_download_locked, autos_status, report_id")
    .eq("id", resultId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (resultError) {
    console.error("Error loading search result:", resultError);
    return json({ error: "Erro ao carregar processo" }, 500);
  }
  if (!result) return json({ error: "Processo não encontrado" }, 404);
  if (!result.process_number) return json({ error: "Processo sem número CNJ identificado — não é possível baixar os autos" }, 400);

  if (result.autos_download_locked) {
    return json({
      error: "Os autos deste processo já foram baixados. Um novo download só pode ser liberado por um administrador.",
      locked: true,
    }, 403);
  }

  // RESERVA ATÔMICA: só avança se, no exato momento do UPDATE, a linha
  // ainda não estiver travada NEM já reservada por outra requisição em
  // andamento (autos_status = "solicitado"). Se outra requisição concorrente
  // já reservou entre o SELECT acima e este UPDATE, `claimed` vem nulo aqui.
  const { data: claimed, error: claimError } = await adminClient
    .from("process_search_results")
    .update({ autos_status: "solicitado", autos_requested_at: new Date().toISOString() })
    .eq("id", resultId)
    .eq("user_id", user.id)
    .eq("autos_download_locked", false)
    .neq("autos_status", "solicitado")
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("Error claiming autos download:", claimError);
    return json({ error: "Erro ao iniciar download" }, 500);
  }
  if (!claimed) {
    return json({
      error: "Já existe um download em andamento (ou já concluído) para este processo. Aguarde ou verifique o status.",
      locked: true,
    }, 409);
  }

  const { data: report } = await adminClient
    .from("process_search_reports")
    .select("integration_id")
    .eq("id", result.report_id)
    .maybeSingle();

  const { data: integration } = await adminClient
    .from("publication_integrations")
    .select("id, api_key, price_per_autos")
    .eq("id", report?.integration_id)
    .maybeSingle();

  if (!integration?.api_key) {
    // Libera a reserva — não há como prosseguir, então não faz sentido
    // deixar o processo preso em "solicitado" impedindo novas tentativas.
    await adminClient
      .from("process_search_results")
      .update({ autos_status: "erro", autos_error: "Integração JusBrasil não encontrada ou sem chave" })
      .eq("id", resultId);
    return json({ error: "Integração JusBrasil não encontrada ou sem chave" }, 400);
  }

  try {
    const documents = await fetchCaseAutos(integration.api_key, result.process_number);
    if (documents.length === 0) {
      await adminClient
        .from("process_search_results")
        .update({ autos_status: "erro", autos_error: "Nenhum documento disponível para este processo (pode estar em segredo de justiça ou o tribunal não suportar consulta de anexos)." })
        .eq("id", resultId);
      return json({ error: "Nenhum documento disponível para este processo." }, 502);
    }

    let saved = 0;
    for (const doc of documents) {
      try {
        const fileResponse = await fetch(doc.url);
        if (!fileResponse.ok) continue;
        const blob = await fileResponse.blob();
        const filePath = `${user.id}/${resultId}/${Date.now()}_${doc.nome}`;
        const { error: uploadError } = await adminClient.storage
          .from("process-search-documents")
          .upload(filePath, blob, { contentType: doc.tipo || "application/pdf" });
        if (uploadError) {
          console.error("Error uploading autos document:", uploadError);
          continue;
        }
        await adminClient.from("process_search_documents").insert({
          result_id: resultId,
          user_id: user.id,
          file_name: doc.nome,
          file_path: filePath,
          file_size: blob.size,
          file_type: doc.tipo || "application/pdf",
          source_url: doc.url,
        });
        saved += 1;
      } catch (docErr) {
        console.error("Error downloading individual autos document:", docErr);
      }
    }

    // Marca como pronto e TRAVA — mesmo que só parte dos documentos tenha
    // baixado com sucesso, a tentativa já contou (evita repetir cobrança
    // no JusBrasil ficando preso num loop de novas tentativas).
    await adminClient
      .from("process_search_results")
      .update({
        autos_status: saved > 0 ? "pronto" : "erro",
        autos_download_locked: true,
        autos_downloaded_at: new Date().toISOString(),
        autos_error: saved > 0 ? null : "Falha ao baixar os documentos retornados pelo JusBrasil.",
      })
      .eq("id", resultId);

    // Usa o preço configurado em Integrações (price_per_autos) — antes era
    // gravado sempre 0, mesmo com um valor configurado, o que zerava o
    // contador financeiro independente da configuração comercial.
    const unitPrice = integration.price_per_autos ?? 0;
    await adminClient.from("process_search_charges").insert({
      user_id: user.id,
      integration_id: integration.id,
      source: "jusbrasil",
      document: result.process_number,
      document_type: "nome",
      search_type: "autos",
      unit_price: unitPrice,
      charged_amount: unitPrice,
    });

    return json({ success: saved > 0, documents_saved: saved, locked: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error fetching case autos:", message);
    // Falha ao FALAR com o JusBrasil (não chegou a listar/baixar nada) —
    // não trava, o usuário pode tentar de novo. A trava é só para quando o
    // download efetivamente aconteceu (ver bloco de sucesso acima). Como o
    // autos_status volta a ser "erro" (diferente de "solicitado"), a reserva
    // atômica acima libera automaticamente uma nova tentativa.
    await adminClient
      .from("process_search_results")
      .update({ autos_status: "erro", autos_error: message.slice(0, 500) })
      .eq("id", resultId);
    return json({ error: `Erro ao buscar autos no JusBrasil: ${message}`, locked: false }, 502);
  }
});
