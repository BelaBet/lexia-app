-- Integração automática de publicações (JusBrasil, WebJur) via webhook,
-- e notificações in-app quando uma nova publicação é importada automaticamente.

ALTER TYPE public.publication_source ADD VALUE IF NOT EXISTS 'webjur';

-- Colunas de apoio à importação automática
ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS imported_automatically BOOLEAN NOT NULL DEFAULT false;

-- Evita duplicar a mesma publicação vinda do provedor em reenvios de webhook
CREATE UNIQUE INDEX IF NOT EXISTS idx_publications_user_source_external
  ON public.publications (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- Cada usuário cadastra, por fonte (jusbrasil/webjur), um segredo de webhook
-- próprio. O provedor externo é configurado para enviar o POST usando esse
-- segredo, e a edge function valida (user_id da URL + segredo do header)
-- antes de gravar qualquer coisa na conta do usuário.
CREATE TABLE public.publication_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source public.publication_source NOT NULL,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  api_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, source)
);

ALTER TABLE public.publication_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own publication integrations"
ON public.publication_integrations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own publication integrations"
ON public.publication_integrations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own publication integrations"
ON public.publication_integrations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own publication integrations"
ON public.publication_integrations FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_publication_integrations_updated_at
  BEFORE UPDATE ON public.publication_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notificações in-app simples (sino no menu)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link_tab TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id, is_read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

-- Somente o backend (service role, usado pela edge function de webhook)
-- pode criar notificações — usuários não inserem diretamente.
