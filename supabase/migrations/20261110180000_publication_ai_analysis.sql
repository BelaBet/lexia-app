-- Fase 1 da análise por IA de publicações: resumo + orientação jurídica +
-- sugestão de prazo (quando o motor de regras determinístico não achou uma
-- regra confiável). Disparado manualmente pelo botão "Analisar com IA" —
-- nenhuma automação ainda, nenhum evento de Agenda é criado a partir disso.
alter table public.publications
  add column if not exists ai_summary text,
  add column if not exists ai_orientation text,
  add column if not exists ai_suggested_deadline date,
  add column if not exists ai_confidence text,
  add column if not exists ai_model text,
  add column if not exists ai_analyzed_at timestamptz,
  add column if not exists ai_error text;

alter table public.publications
  add constraint publications_ai_confidence_check
  check (ai_confidence is null or ai_confidence in ('alta', 'baixa'));
