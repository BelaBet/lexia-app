// Traduz um texto juridico (movimentacao/publicacao) para uma explicacao
// simples destinada ao cliente, usada pelo botao "Traduzir com IA" ao criar
// um item de timeline manualmente, e tambem pela criacao automatica a
// partir de publicacoes importadas (publication-webhook / poll-jusbrasil).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { checkAndLogRateLimit } from "../_shared/rateLimit.ts";
import { humanizeForClient } from "../_shared/humanizeForClient.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Configuracao do Supabase ausente" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticacao obrigatoria" }, 401);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Sessao invalida ou expirada" }, 401);

  const RATE_LIMIT_MAX = Number(Deno.env.get("AI_RATE_LIMIT_MAX") ?? "20");
  const RATE_LIMIT_WINDOW_SECONDS = Number(Deno.env.get("AI_RATE_LIMIT_WINDOW_SECONDS") ?? "300");
  const { allowed, error: rateLimitError } = await checkAndLogRateLimit(supabase, user.id, "humanize-timeline-event", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
  if (rateLimitError) console.error("Rate limit check failed", rateLimitError);
  if (!allowed) {
    const minutes = Math.max(1, Math.round(RATE_LIMIT_WINDOW_SECONDS / 60));
    return json({ error: `Limite de uso da IA atingido (${RATE_LIMIT_MAX} vezes a cada ${minutes} minuto(s)). Aguarde um pouco.` }, 429);
  }

  let body: { case_id?: string; raw_text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisicao invalido" }, 400);
  }

  const caseId = body.case_id?.trim();
  const rawText = body.raw_text?.trim();
  if (!caseId || !rawText) return json({ error: "Informe o caso e o texto a traduzir" }, 400);

  // A consulta usa o cliente autenticado (anon key + JWT do usuario), entao
  // a RLS ja garante que so retorna o caso se o usuario for dono dele.
  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, case_number")
    .eq("id", caseId)
    .maybeSingle();

  if (caseError) {
    console.error("humanize-timeline-event: error loading case", caseError);
    return json({ error: "Erro ao verificar o caso" }, 500);
  }
  if (!caseRow) return json({ error: "Caso nao encontrado ou sem permissao" }, 404);

  const result = await humanizeForClient(rawText, caseRow.case_number ?? null);
  if (!result) return json({ error: "Nao foi possivel gerar a traducao agora. Tente novamente em instantes." }, 502);

  return json(result);
});
