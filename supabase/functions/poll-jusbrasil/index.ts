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
import { findOrCreateCaseId, ProcessualData } from "../_shared/findOrCreateCase.ts";
import { syncDeadlineEvents, attachDocumentIfAvailable } from "../_shared/syncPublicationExtras.ts";

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
  vara?: string;
  orgao_julgador?: string;
  orgaoJulgador?: string;
  comarca?: string;
  municipio?: string;
  foro?: string;
  valor_causa?: string | number;
  valorCausa?: string | number;
  valor_da_causa?: string | number;
  data_distribuicao?: string;
  dataDistribuicao?: string;
  data_abertura?: string;
  dataAbertura?: string;
  data_aceitacao?: string;
  dataAceitacao?: string;
  prazo_externo?: string;
  prazoExterno?: string;
  prazo?: string;
  deadline?: string;
  prazo_interno?: string;
  prazoInterno?: string;
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

function firstDate(...values: unknown[]): string | null {
  const raw = firstString(...values);
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string" && v.trim().length > 0) {
      // Aceita tanto "12345.67" quanto formato brasileiro "12.345,67".
      const normalized = v.trim().replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

// Extrai os dados processuais destacados no sistema (vara, comarca, valor da
// causa, data de abertura no tribunal e data de aceitação) a partir do item
// retornado pela API do JusBrasil. Os nomes de campo abaixo são uma tentativa
// razoável baseada nos termos mais comuns usados por consultas processuais —
// TODO: confirmar/ajustar contra um payload de exemplo real assim que houver
// acesso à conta ativa.
function extractProcessualData(item: JusbrasilProcessItem): ProcessualData {
  return {
    vara: firstString(item.vara, item.orgao_julgador, item.orgaoJulgador),
    comarca: firstString(item.comarca, item.municipio, item.foro),
    valor_causa: firstNumber(item.valor_causa, item.valorCausa, item.valor_da_causa),
    data_abertura_tribunal: firstDate(
      item.data_distribuicao,
      item.dataDistribuicao,
      item.data_abertura,
      item.dataAbertura,
    ),
    data_aceitacao: firstDate(item.data_aceitacao, item.dataAceitacao),
  };
}

// Extrai os prazos externo e interno, quando a API já os fornecer, para que
// os eventos correspondentes já nasçam na Agenda junto com a publicação —
// TODO: confirmar os nomes de campo reais quando houver payload de exemplo.
function extractDeadlines(item: JusbrasilProcessItem): { external: string | null; internal: string | null } {
  return {
    external: firstDate(item.prazo_externo, item.prazoExterno, item.prazo, item.deadline),
    internal: firstDate(item.prazo_interno, item.prazoInterno),
  };
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

        const processualData = extractProcessualData(item);
        const deadlines = extractDeadlines(item);

        // Abre (ou reaproveita) o Caso correspondente antes de gravar a
        // publicação, para ela já nascer vinculada e aparecer em "Casos" —
        // já com os dados processuais destacados (vara, comarca, valor da
        // causa, datas), quando a API os fornecer.
        const caseId = await findOrCreateCaseId(adminClient, integration.user_id, processNumber, processualData);

        const { data: inserted, error: insertError } = await adminClient
          .from("publications")
          .insert({
            user_id: integration.user_id,
            source: "jusbrasil",
            content,
            published_date: publishedDate,
            process_number: processNumber,
            case_id: caseId,
            external_id: externalId,
            external_deadline: deadlines.external,
            internal_deadline: deadlines.internal,
            raw_payload: item,
            imported_automatically: true,
            status: "pending",
            ...processualData,
          })
          .select("id")
          .maybeSingle();

        if (insertError && insertError.code !== "23505") {
          console.error("Error inserting polled publication:", insertError);
          continue;
        }
        if (inserted) {
          imported += 1;

          // Prazo(s) já viram evento na Agenda, e o documento do processo
          // (quando o payload já o fornecer) é baixado e anexado à
          // publicação — nenhum dos dois depende de ação manual depois.
          await syncDeadlineEvents(adminClient, integration.user_id, {
            id: inserted.id,
            case_id: caseId,
            process_number: processNumber,
            content,
            external_deadline: deadlines.external,
            internal_deadline: deadlines.internal,
          });
          await attachDocumentIfAvailable(adminClient, inserted.id, item);

          await adminClient.from("notifications").insert({
            user_id: integration.user_id,
            title: "Nova publicação importada via JusBrasil",
            message: processNumber
              ? `Processo ${processNumber}${caseId ? " — caso aberto automaticamente" : ""}`
              : content.slice(0, 140),
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
