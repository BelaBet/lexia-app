// Compartilhado entre publication-webhook e pollJusbrasilIntegration: a
// deduplicação de publicações importadas via API depende inteiramente de
// `external_id` (índice único em publications(user_id, source, external_id)
// WHERE external_id IS NOT NULL — ver migração
// 20260901134826_dedup_publications_external_id, se existir, ou a definição
// atual do índice). O nome exato do campo que cada provedor usa como
// identificador único do item ainda não está confirmado (ver TODOs nos
// arquivos que chamam extractExternalId/item.id) — então, sempre que nenhum
// candidato de campo for reconhecido no payload, em vez de deixar
// external_id nulo (o que faz o índice único não se aplicar e permite
// reimportar o MESMO item repetidamente a cada execução, duplicando
// publicações, prazos na Agenda e notificações), calculamos aqui um
// identificador determinístico a partir do conteúdo do próprio item. Assim,
// se o provedor devolver o mesmo item de novo (comum quando a consulta não
// usa cursor/timestamp), o fallback gera o mesmo hash e a deduplicação
// continua funcionando — não é perfeito (um item que mudou de conteúdo gera
// um novo hash), mas é muito melhor do que nenhuma deduplicação.

export async function computeFallbackExternalId(parts: Array<string | null | undefined>): Promise<string> {
  const raw = parts.filter((p): p is string => Boolean(p && p.length > 0)).join("|");
  const data = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `fallback:${hex.slice(0, 40)}`;
}
