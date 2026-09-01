import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { checkAndLogRateLimit } from "../_shared/rateLimit.ts";

const MAX_PAGES = 20;
const MAX_IMAGE_DATA_URL_LENGTH = 15_000_000; // ~11MB decoded, matches the frontend's 10MB file cap with base64 overhead

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(
    req,
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  );

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify user with Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[pdf-ocr] Processing OCR request for user: ${user.id}`);

    const { images, fileName } = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (images.length > MAX_PAGES) {
      return new Response(JSON.stringify({ error: `Too many pages. Maximum is ${MAX_PAGES} per request.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeImages = images.filter(
      (img): img is string => typeof img === "string" && img.startsWith("data:image/") && img.length <= MAX_IMAGE_DATA_URL_LENGTH,
    );
    if (safeImages.length !== images.length) {
      return new Response(JSON.stringify({ error: "One or more pages are not valid images or exceed the size limit." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-user sliding-window rate limit, same mechanism as legal-chat.
    const RATE_LIMIT_MAX = Number(Deno.env.get("AI_RATE_LIMIT_MAX") ?? "20");
    const RATE_LIMIT_WINDOW_SECONDS = Number(Deno.env.get("AI_RATE_LIMIT_WINDOW_SECONDS") ?? "300");
    const { allowed, error: rateLimitError } = await checkAndLogRateLimit(supabase, user.id, "pdf-ocr", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
    if (rateLimitError) console.error("[pdf-ocr] Rate limit check failed", rateLimitError);
    if (!allowed) {
      const minutes = Math.max(1, Math.round(RATE_LIMIT_WINDOW_SECONDS / 60));
      return new Response(JSON.stringify({ error: `Limite de ${RATE_LIMIT_MAX} requisições a cada ${minutes} minuto(s) atingido. Aguarde um pouco antes de tentar novamente.` }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[pdf-ocr] Processing ${images.length} page(s) from: ${fileName}`);

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_OCR_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
    if (!openaiApiKey) {
      console.error("[pdf-ocr] OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build multimodal content with images
    const imageContents = safeImages.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: img, // base64 data URL
      },
    }));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Você é um sistema de OCR (Reconhecimento Óptico de Caracteres) especializado em documentos jurídicos brasileiros.

Sua tarefa é extrair TODO o texto visível das imagens de páginas de PDF fornecidas.

Instruções:
1. Extraia o texto exatamente como aparece no documento, mantendo a estrutura
2. Preserve parágrafos, numerações, e formatação quando possível
3. Se houver tabelas, tente reproduzi-las de forma legível
4. Indique claramente a separação entre páginas com "--- Página X ---"
5. Se alguma parte estiver ilegível, indique com [ilegível]
6. Não adicione comentários ou interpretações - apenas extraia o texto
7. Mantenha termos jurídicos, nomes próprios, datas e números exatamente como aparecem`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Por favor, extraia todo o texto das ${images.length} página(s) do documento "${fileName}". Retorne apenas o texto extraído, organizado por página.`,
              },
              ...imageContents,
            ],
          },
        ],
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[pdf-ocr] OpenAI error: ${response.status}`, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Insufficient credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "OCR processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || "";

    console.log(`[pdf-ocr] OCR completed: ${extractedText.length} characters extracted`);

    return new Response(JSON.stringify({ text: extractedText, pages: images.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[pdf-ocr] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
