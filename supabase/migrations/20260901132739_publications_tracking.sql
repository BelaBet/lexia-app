-- Rastreamento de Publicações (Diário Oficial / Jusbrasil / Escavador / manual)
-- Cada publicação pode ter um prazo interno e um prazo externo, cada um com
-- um responsável (advogado ou operacional), um histórico de acompanhamento
-- (followups) e uma tese jurídica associada.

CREATE TYPE public.publication_source AS ENUM ('manual', 'jusbrasil', 'escavador', 'outro');
CREATE TYPE public.publication_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue', 'cancelled');
CREATE TYPE public.publication_responsible_role AS ENUM ('advogado', 'operacional');

CREATE TABLE public.publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,

  process_number TEXT,
  source public.publication_source NOT NULL DEFAULT 'manual',
  content TEXT NOT NULL,
  published_date DATE NOT NULL,

  -- Prazo externo: o prazo processual real
  external_deadline DATE,
  external_responsible_name TEXT,
  external_responsible_role public.publication_responsible_role,

  -- Prazo interno: data definida pela equipe para concluir com folga
  internal_deadline DATE,
  internal_responsible_name TEXT,
  internal_responsible_role public.publication_responsible_role,

  tese TEXT,
  status public.publication_status NOT NULL DEFAULT 'pending',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_publications_user_id ON public.publications(user_id);
CREATE INDEX idx_publications_external_deadline ON public.publications(external_deadline);
CREATE INDEX idx_publications_internal_deadline ON public.publications(internal_deadline);

-- Histórico de acompanhamento (followup) de cada publicação
CREATE TABLE public.publication_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_publication_followups_publication_id ON public.publication_followups(publication_id);

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own publications"
ON public.publications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own publications"
ON public.publications FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own publications"
ON public.publications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own publications"
ON public.publications FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can view followups of their publications"
ON public.publication_followups FOR SELECT
USING (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND user_id = auth.uid())
);

CREATE POLICY "Users can create followups on their publications"
ON public.publication_followups FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND user_id = auth.uid())
);

CREATE POLICY "Users can delete followups of their publications"
ON public.publication_followups FOR DELETE
USING (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND user_id = auth.uid())
);

CREATE TRIGGER update_publications_updated_at
  BEFORE UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
