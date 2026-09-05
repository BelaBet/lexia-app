import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { checkAndLogRateLimit } from "../_shared/rateLimit.ts";

const MAX_TEXT_LENGTH = 4000;
const MAX_EXISTING_ITEMS = 50;

function clampText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : undefined;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(
    req,
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  );

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated user before spending AI credits on their behalf.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Autenticação obrigatória" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    const context = clampText(body?.context, MAX_TEXT_LENGTH);
    if (!context) {
      return new Response(JSON.stringify({ error: "Informe o contexto para gerar sugestões" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caseType = clampText(body?.caseType, 200);
    const clientInfo = clampText(body?.clientInfo, MAX_TEXT_LENGTH);
    const existingItems = Array.isArray(body?.existingItems)
      ? body.existingItems.filter((i: unknown): i is string => typeof i === "string").slice(0, MAX_EXISTING_ITEMS).map((i: string) => i.slice(0, 200))
      : [];

    // Per-user sliding-window rate limit, same mechanism as legal-chat.
    const RATE_LIMIT_MAX = Number(Deno.env.get("AI_RATE_LIMIT_MAX") ?? "20");
    const RATE_LIMIT_WINDOW_SECONDS = Number(Deno.env.get("AI_RATE_LIMIT_WINDOW_SECONDS") ?? "300");
    const { allowed, error: rateLimitError } = await checkAndLogRateLimit(supabase, user.id, "suggest-checklist-items", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
    if (rateLimitError) console.error("Rate limit check failed", rateLimitError);
    if (!allowed) {
      const minutes = Math.max(1, Math.round(RATE_LIMIT_WINDOW_SECONDS / 60));
      return new Response(
        JSON.stringify({ error: `Limite de ${RATE_LIMIT_MAX} requisições a cada ${minutes} minuto(s) atingido. Aguarde um pouco antes de tentar novamente.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = `Você é um assistente jurídico especializado em direito brasileiro. Sua função é sugerir itens de checklist para acompanhamento de obrigações jurídicas.

Considere:
- O contexto (processo, cliente, ou obrigação geral)
- O tipo de processo quando aplicável
- Informações do cliente quando disponíveis
- Itens já existentes para evitar duplicação

Forneça sugestões práticas, específicas e acionáveis para o contexto jurídico brasileiro.`;

    const userPrompt = `Sugira itens de checklist para:

Contexto: ${context}
${caseType ? `Tipo de Processo: ${caseType}` : ''}
${clientInfo ? `Informações do Cliente: ${clientInfo}` : ''}
${existingItems?.length ? `Itens já existentes: ${existingItems.join(', ')}` : ''}

Retorne sugestões de itens de checklist que seriam relevantes para este contexto.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
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
              name: "suggest_checklist_items",
              description: "Retorna sugestões de itens para um checklist jurídico",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string",
                          description: "Título curto e claro do item"
                        },
                        description: { 
                          type: "string",
                          description: "Descrição detalhada do que deve ser feito"
                        },
                        priority: { 
                          type: "string", 
                          enum: ["low", "medium", "high", "urgent"],
                          description: "Prioridade do item"
                        },
                        days_before_deadline: {
                          type: "number",
                          description: "Quantos dias antes do prazo principal este item deve ser concluído"
                        },
                        is_required: {
                          type: "boolean",
                          description: "Se o item é obrigatório ou opcional"
                        }
                      },
                      required: ["title", "description", "priority", "is_required"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["suggestions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_checklist_items" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos para continuar." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);
      throw new Error("Erro ao comunicar com IA");
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const suggestions = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(suggestions), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
