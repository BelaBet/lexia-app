// Traduz um texto juridico bruto para uma explicacao curta e simples,
// destinada a uma pessoa leiga acompanhando o proprio processo. Usado pelo
// edge function humanize-timeline-event e, futuramente, pela criacao
// automatica de itens de timeline a partir de publicacoes importadas.

export interface HumanizedResult {
  title: string;
  client_summary: string;
}

export async function humanizeForClient(rawText: string, processNumber: string | null): Promise<HumanizedResult | null> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    console.error("humanizeForClient: OPENAI_API_KEY nao configurada");
    return null;
  }
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

  const systemPrompt = `Voce traduz textos juridicos (movimentacoes processuais, publicacoes) para uma explicacao simples, curta e tranquilizadora, destinada ao CLIENTE (uma pessoa leiga, sem conhecimento juridico) que acompanha o andamento do seu proprio processo.

Regras obrigatorias:
- Baseie-se EXCLUSIVAMENTE no texto fornecido. Nunca invente fatos, prazos, decisoes ou interpretacoes juridicas que nao estejam no texto.
- Se o texto nao deixar claro o que aconteceu, diga isso de forma simples, sem especular.
- Nunca de conselho juridico nem faca promessas sobre o resultado do processo.
- Portugues do Brasil, tom calmo e profissional, sem jargao juridico.
- Responda em JSON: {"title": "titulo curto (ate 8 palavras)", "client_summary": "2 a 4 frases em linguagem simples"}`;

  const userPrompt = processNumber
    ? `Processo ${processNumber}. Texto da movimentacao/publicacao:\n\n${rawText}`
    : `Texto da movimentacao/publicacao:\n\n${rawText}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt.slice(0, 8000) },
        ],
      }),
    });

    if (!response.ok) {
      console.error("humanizeForClient: OpenAI error", response.status, (await response.text().catch(() => "")).slice(0, 1000));
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (typeof parsed.title !== "string" || typeof parsed.client_summary !== "string") return null;

    return { title: parsed.title.slice(0, 200), client_summary: parsed.client_summary.slice(0, 2000) };
  } catch (err) {
    console.error("humanizeForClient: unexpected error", err);
    return null;
  }
}
