-- Configuração de marca (white label) desta instância do sistema.
-- Cada cópia/deploy do sistema (um cliente revendido) tem seu próprio banco
-- Supabase, então basta uma única linha de configuração por projeto.
-- Leitura é pública (a tela de login precisa mostrar a marca antes do
-- usuário entrar); só administradores podem alterar.

CREATE TABLE public.white_label_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  brand_name TEXT NOT NULL DEFAULT 'LexIA',
  tagline TEXT NOT NULL DEFAULT 'Assistente Jurídico Inteligente',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#B8860B',
  sidebar_color TEXT NOT NULL DEFAULT '#152238',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT white_label_settings_singleton CHECK (id)
);

INSERT INTO public.white_label_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view the platform branding"
ON public.white_label_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can update the platform branding"
ON public.white_label_settings FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_white_label_settings_updated_at
  BEFORE UPDATE ON public.white_label_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket de armazenamento para o logo enviado pelo administrador.
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view branding files"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

CREATE POLICY "Admins can upload branding files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update branding files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete branding files"
ON storage.objects FOR DELETE
USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));
