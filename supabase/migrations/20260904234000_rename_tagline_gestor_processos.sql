-- Atualiza a tagline padrão da marca de "Assistente Jurídico Inteligente"
-- para "Gestor Inteligente de Processos" — tanto o valor padrão da coluna
-- (usado por instâncias/forks novos) quanto a linha singleton já existente
-- em produção (o que a tela realmente exibe hoje).

ALTER TABLE public.white_label_settings
  ALTER COLUMN tagline SET DEFAULT 'Gestor Inteligente de Processos';

UPDATE public.white_label_settings
SET tagline = 'Gestor Inteligente de Processos'
WHERE id = true AND tagline = 'Assistente Jurídico Inteligente';
