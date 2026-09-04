-- 1) Agenda ganha campos de tarefa (status/prioridade), na mesma linguagem
--    já usada em Checklists, para poder funcionar também como gerenciador
--    de tarefas — sem quebrar eventos existentes (campos opcionais).
--    `publication_id` liga o evento à publicação que o originou, para criar
--    o evento automaticamente a partir do prazo de uma publicação sem
--    duplicar caso ela seja reprocessada.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status public.checklist_status,
  ADD COLUMN IF NOT EXISTS priority public.checklist_priority,
  ADD COLUMN IF NOT EXISTS publication_id UUID REFERENCES public.publications(id);

COMMENT ON COLUMN public.events.status IS 'Status de tarefa do evento (pendente/em andamento/concluído/atrasado/cancelado) — permite usar a Agenda como gerenciador de tarefas. Nulo = evento sem acompanhamento de tarefa.';
COMMENT ON COLUMN public.events.priority IS 'Prioridade da tarefa associada ao evento.';
COMMENT ON COLUMN public.events.publication_id IS 'Publicação que originou este evento automaticamente (prazo externo/interno importado).';

CREATE INDEX IF NOT EXISTS events_publication_id_idx ON public.events(publication_id);

-- Evita duplicar o mesmo evento de prazo (mesma publicação + mesmo "tipo" de
-- prazo) se a publicação for reprocessada/atualizada.
CREATE UNIQUE INDEX IF NOT EXISTS events_publication_type_unique
  ON public.events(publication_id, type)
  WHERE publication_id IS NOT NULL;

-- 2) Documentos/anexos do processo vindos junto com a publicação importada
--    via API (JusBrasil/WebJur/Escavador) ou anexados manualmente.

CREATE OR REPLACE FUNCTION public.is_publication_owner(_publication_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.publications WHERE id = _publication_id AND user_id = auth.uid()
  );
$function$;

CREATE TABLE public.publication_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source = ANY (ARRAY['manual'::text, 'api'::text])),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.publication_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view publication attachments"
ON public.publication_attachments FOR SELECT
USING (public.is_publication_owner(publication_id));

CREATE POLICY "Owners can add publication attachments"
ON public.publication_attachments FOR INSERT
WITH CHECK (public.is_publication_owner(publication_id));

CREATE POLICY "Owners can delete publication attachments"
ON public.publication_attachments FOR DELETE
USING (public.is_publication_owner(publication_id));

INSERT INTO storage.buckets (id, name, public)
VALUES ('publication-attachments', 'publication-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owners can view publication attachment files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'publication-attachments'
  AND public.is_publication_owner(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Owners can upload publication attachment files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'publication-attachments'
  AND public.is_publication_owner(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Owners can delete publication attachment files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'publication-attachments'
  AND public.is_publication_owner(((storage.foldername(name))[1])::uuid)
);
