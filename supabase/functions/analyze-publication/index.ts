// Fase 1 da análise por IA de publicações (ver conversa de planejamento):
// gera um resumo em linguagem simples + orientação jurídica do que fazer, e
// — só quando o motor de regras determinístico (_shared/deadlineClassifier.ts)
// não achou uma regra confiável para o ato — sugere um prazo, sempre
// marcado com confiança e nunca sobrescrevendo um prazo já calculado com
// confiança pela regra. Disparado manualmente pelo botão "Analisar com IA";
// nenhuma automação/criação de evento na Agenda ainda nesta fase.
//
// Usa a mesma credencial central OPENAI_API_KEY já configurada para
// legal-chat/suggest-checklist-items (Supabase Edge Function secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { checkAndLogRateLimit } from "../_shared/rateLimit.ts";

const MAX_CONTENT_LENGTH = 6000;
const MAX_OUTPUT_LENGTH = 4000;

const areaLabels: Record<string, string> = {
  civel: "Cível",
  criminal: "Criminal",
  trabalhista: "Trabalhista",
  administrativo_tributario: "Administrativo/Tributário",
};

interface AnalysisResult {
  resumo: string;
  orientacao: string;
  prazo_sugerido: string | null;
  confianca: "alta" | "baixa";
  justificativa: string;
}

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
  if (!supabaseUrl || !anonKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  // Cliente autenticado como o próprio usuário (não service role): o
  // SELECT/UPDATE em publications passa pela RLS existente, que já libera
  // dono OU colaborador do caso (is_case_collaborator) — sem duplicar essa
  // regra de autorização aqui.
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { publication_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.publication_id) return json({ error: "publication_id é obrigatório" }, 400);

  const RATE_LIMIT_MAX = Number(Deno.env.get("AI_RATE_LIMIT_MAX") ?? "20");
  const RATE_LIMIT_WINDOW_SECONDS = Number(Deno.env.get("AI_RATE_LIMIT_WINDOW_SECONDS") ?? "300");
  const { allowed, error: rateLimitError } = await checkAndLogRateLimit(
    supabase,
    user.id,
    "analyze-publication",
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (rateLimitError) console.error("Rate limit check failed", rateLimitError);
  if (!allowed) {
    const minutes = Math.max(1, Math.round(RATE_LIMIT_WINDOW_SECONDS / 60));
    return json({ error: `Limite de ${RATE_LIMIT_MAX} requisições a cada ${minutes} minuto(s) atingido. Aguarde um pouco antes de tentar novamente.` }, 429);
  }

  const { data: publication, error: pubError } = await supabase
    .from("publications")
    .select("id, case_id, content, process_number, classified_area, classified_act_name, classified_deadline, classified_needs_review, classified_rule_note")
    .eq("id", body.publication_id)
    .maybeSingle();
  if (pubError) {
    console.error("analyze-publication: error loading publication", pubError);
    return json({ error: "Erro ao carregar publicação" }, 500);
  }
  if (!publication) return json({ error: "Publicação não encontrada" }, 404);

  let caseType: string | null = null;
  if (publication.case_id) {
    const { data: caseRow } = await supabase.from("cases").select("type").eq("id", publication.case_id).maybeSingle();
    caseType = caseRow?.type ?? null;
  }

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  if (!openaiApiKey) return json({ error: "OPENAI_API_KEY não configurada no Supabase" }, 503);

  // Já existe uma regra determinística confiável (classifyDeadline, ver
  // _shared/deadlineClassifier.ts) — a IA não deve sugerir um prazo
  // concorrente, só resumir/orientar.
  const hasConfidentRule = Boolean(publication.classified_act_name) && !publication.classified_needs_review;

  const systemPrompt = `Você é um assistente jurídico especializado em direito processual brasileiro, ajudando advogados a triar publicações do Diário Oficial e andamentos processuais.

Sua tarefa, para a publicação informada:
1. Resuma o teor em linguagem simples e direta, destacando o que mudou no processo.
2. Oriente objetivamente o que o advogado deve fazer a seguir (ação jurídica recomendada), em tópicos curtos.
3. ${
    hasConfidentRule
      ? 'O sistema já calculou automaticamente um prazo confiável para este ato. NÃO sugira outro prazo: retorne prazo_sugerido como null e confianca como "alta".'
      : 'Se for possível identificar com segurança um prazo processual a cumprir, sugira a data em prazo_sugerido (formato YYYY-MM-DD) e explique o raciocínio em justificativa, com confianca "alta". Se não tiver certeza da regra aplicável, ou o prazo depender de decisão judicial futura, retorne prazo_sugerido null e confianca "baixa" — NUNCA invente uma regra de prazo da qual não tenha certeza.'
  }

Responda sempre em português do Brasil, com linguagem clara e profissional. Nunca afirme certeza sobre algo que não esteja explícito no teor da publicação.`;

  const contentForPrompt = publication.content.slice(0, MAX_CONTENT_LENGTH);
  const userPrompt = `Processo: ${publication.process_number ?? "não informado"}
Área do direito: ${areaLabels[publication.classified_area ?? ""] ?? caseType ?? "não informada"}
${hasConfidentRule ? `Ato já detectado automaticamente: ${publication.classified_act_name} — prazo calculado: ${publication.classified_deadline ?? "—"} (${publication.classified_rule_note ?? ""})` : ""}

Teor da publicação:
"""
${contentForPrompt}
"""`;

  let openaiResponse: Response;
  try {
    openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_publication",
              description: "Retorna o resumo, orientação jurídica e sugestão de prazo para a publicação",
              parameters: {
                type: "object",
                properties: {
                  resumo: { type: "string", description: "Resumo em linguagem simples do teor da publicação" },
                  orientacao: { type: "string", description: "Orientação jurídica objetiva sobre o que fazer a seguir, em tópicos" },
                  prazo_sugerido: { type: ["string", "null"], description: "Data sugerida do prazo processual, formato YYYY-MM-DD, ou null se não houver ou não tiver certeza" },
                  confianca: { type: "string", enum: ["alta", "baixa"], description: "Confiança na sugestão de prazo" },
                  justificativa: { type: "string", description: "Breve justificativa da sugestão de prazo (ou do motivo de não sugerir)" },
                },
                required: ["resumo", "orientacao", "prazo_sugerido", "confianca", "justificativa"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_publication" } },
      }),
    });
  } catch (err) {
    console.error("analyze-publication: fetch error", err instanceof Error ? err.message : String(err));
    return json({ error: "Erro de rede ao comunicar com a IA" }, 502);
  }

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text().catch(() => "");
    console.error("analyze-publication: OpenAI error", openaiResponse.status, errorText);
    await supabase.from("publications").update({
      ai_error: `Erro OpenAI ${openaiResponse.status}`,
      ai_analyzed_at: new Date().toISOString(),
    }).eq("id", publication.id);
    if (openaiResponse.status === 429) return json({ error: "Limite de requisições da IA excedido. Tente novamente em instantes." }, 429);
    return json({ error: "Erro ao comunicar com a IA" }, 502);
  }

  const data = await openaiResponse.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    return json({ error: "IA não retornou uma análise válida" }, 502);
  }

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    return json({ error: "Resposta da IA em formato inválido" }, 502);
  }

  // Defesa em profundidade: mesmo que o modelo ignore a instrução, nunca
  // persistimos uma sugestão de prazo quando já existe uma regra confiável.
  const suggestedDeadline = hasConfidentRule ? null : (parsed.prazo_sugerido || null);
  const confidence: "alta" | "baixa" = parsed.confianca === "alta" ? "alta" : "baixa";

  const { error: updateError } = await supabase
    .from("publications")
    .update({
      ai_summary: (parsed.resumo ?? "").slice(0, MAX_OUTPUT_LENGTH) || null,
      ai_orientation: (parsed.orientacao ?? "").slice(0, MAX_OUTPUT_LENGTH) || null,
      ai_suggested_deadline: suggestedDeadline,
      ai_confidence: confidence,
      ai_model: model,
      ai_analyzed_at: new Date().toISOString(),
      ai_error: null,
    })
    .eq("id", publication.id);
  if (updateError) {
    console.error("analyze-publication: error saving analysis", updateError);
    return json({ error: "Erro ao salvar análise" }, 500);
  }

  return json({
    success: true,
    summary: parsed.resumo,
    orientation: parsed.orientacao,
    suggested_deadline: suggestedDeadline,
    confidence,
    justification: parsed.justificativa,
  });
});
