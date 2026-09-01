// Busca ativa periódica no JusBrasil (Consulta Processual), complementando
// o webhook (publication-webhook). Pensada para ser chamada por um job
// agendado (pg_cron + pg_net) uma vez por dia — veja
// supabase/scripts/agendar_busca_ativa_jusbrasil.sql para o agendamento.
//
// Para cada integração ativa da fonte "jusbrasil" que tenha uma api_key e
// pelo menos um identificador de busca (monitor_document = CPF/CNPJ, ou
// monitor_oab = número da OAB), esta função consulta o JusBrasil por
// processos/movimentações novas e importa cada novidade como uma publicação
// (mesma lógica de deduplicação e notificação do webhook).
//
// IMPORTANTE: assim como no publication-webhook, o endpoint exato e o
// formato de resposta da "Consulta Processual" do JusBrasil não estavam
// disponíveis publicamente na documentação no momento em que este código foi
// escrito (a Jusbrasil expõe os detalhes técnicos completos só para contas
// com acesso ativo). O ponto abaixo marcado com TODO é o único lugar que
// precisa ser ajustado assim que houver acesso real à API — o restante do
// fluxo (autenticação por integração, deduplicação, criação de publicação e
// notificação) já está pronto e não muda.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

// TODO: confirmar com a documentação da conta JusBrasil ativa (Consulta
// Processual / Distribuição). Estrutura provável, a ajustar:
const JUSBRASIL_API_BASE_URL = "https://api.jusbrasil.com.br";

interface JusbrasilProcessItem {
  id?: string;
  numero_processo?: string;
  processo?: string;
  resumo?: string;
  conteudo?: string;
  data_publicacao?: string;
  data?: string;
  [key: string]: unknown;
}

async function fetchJusbrasilNewItems(apiKey: string, document: string | null, oab: string | null): Promise<JusbrasilProcessItem[]> {
  // TODO: substituir pelo endpoint real assim que confirmado (ex:
  // `${JUSBRASIL_API_BASE_URL}/v1/processos/consulta` ou similar). O corpo
  // abaixo é uma tentativa razoável baseada na documentação pública
  // (busca por CPF/CNPJ ou por OAB), mas precisa validação com um payload
  // de exemplo real.
  const query: Record<string, string> = {};
  if (document) query.documento = document;
  if (oab) query.oab = oab;

  const response = await fetch(`${JUSBRASIL_API_BASE_URL}/v1/processos/consulta`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    throw new Error(`JusBrasil respondeu ${response.status}: ${await response.text().catch(() => "")}`);
  }

  const data = await response.json();
  // Tenta reconhecer os formatos mais prováveis de lista de resultados.
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.processos)) return data.processos;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: integrations, error: integrationsError } = await adminClient
    .from("publication_integrations")
    .select("id, user_id, api_key, monitor_document, monitor_oab")
    .eq("source", "jusbrasil")
    .eq("is_active", true)
    .not("api_key", "is", null);

  if (integrationsError) {
    console.error("Error loading integrations:", integrationsError);
    return new Response(JSON.stringify({ error: "Erro ao carregar integrações" }), { status: 500 });
  }

  const results: Array<{ user_id: string; imported: number; error?: string }> = [];

  for (const integration of integrations || []) {
    if (!integration.api_key || (!integration.monitor_document && !integration.monitor_oab)) continue;

    try {
      const items = await fetchJusbrasilNewItems(integration.api_key, integration.monitor_document, integration.monitor_oab);
      let imported = 0;

      for (const item of items) {
        const externalId = firstString(item.id);
        const content = firstString(item.conteudo, item.resumo) || JSON.stringify(item).slice(0, 4000);
        const processNumber = firstString(item.numero_processo, item.processo);
        const publishedDateRaw = firstString(item.data_publicacao, item.data);
        const publishedDate = publishedDateRaw && !isNaN(new Date(publishedDateRaw).getTime())
          ? new Date(publishedDateRaw).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        const { data: inserted, error: insertError } = await adminClient
          .from("publications")
          .insert({
            user_id: integration.user_id,
            source: "jusbrasil",
            content,
            published_date: publishedDate,
            process_number: processNumber,
            external_id: externalId,
            raw_payload: item,
            imported_automatically: true,
            status: "pending",
          })
          .select("id")
          .maybeSingle();

        if (insertError && insertError.code !== "23505") {
          console.error("Error inserting polled publication:", insertError);
          continue;
        }
        if (inserted) {
          imported += 1;
          await adminClient.from("notifications").insert({
            user_id: integration.user_id,
            title: "Nova publicação importada via JusBrasil",
            message: processNumber ? `Processo ${processNumber}` : content.slice(0, 140),
            link_tab: "publications",
          });
        }
      }

      await adminClient
        .from("publication_integrations")
        .update({
          last_received_at: imported > 0 ? new Date().toISOString() : undefined,
          last_poll_status: "ok",
          last_poll_error: null,
        })
        .eq("id", integration.id);

      results.push({ user_id: integration.user_id, imported });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error polling JusBrasil for user ${integration.user_id}:`, message);
      await adminClient
        .from("publication_integrations")
        .update({ last_poll_status: "error", last_poll_error: message.slice(0, 500) })
        .eq("id", integration.id);
      results.push({ user_id: integration.user_id, imported: 0, error: message });
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
