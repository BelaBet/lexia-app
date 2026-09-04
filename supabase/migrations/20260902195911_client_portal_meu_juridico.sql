-- Portal do cliente ("Meu Jurídico"): permite que o cliente final acompanhe
-- o andamento do seu caso, receba solicitações de documentos/assinatura e
-- envie arquivos, sem enxergar as anotações internas do escritório.
--
-- NOTA: esta migração foi reconstruída a partir do schema já aplicado em
-- produção (projeto dtpyeytvawomzkcihmsy) em 2026-09-02, pois o arquivo não
-- havia sido versionado no repositório. O SQL abaixo reflete fielmente as
-- tabelas, enums, policies, triggers e funções existentes no banco.

-- Enums -----------------------------------------------------------------

CREATE TYPE public.timeline_event_source AS ENUM ('manual', 'publication', 'document', 'system');
CREATE TYPE public.client_document_uploader AS ENUM ('client', 'lawyer');
CREATE TYPE public.client_document_status AS ENUM ('received', 'processing', 'classified', 'needs_review');
CREATE TYPE public.client_request_type AS ENUM ('document', 'signature', 'questionnaire', 'other');
CREATE TYPE public.client_request_status AS ENUM ('pending', 'fulfilled', 'cancelled');

-- Funções auxiliares de autorização --------------------------------------

CREATE OR REPLACE FUNCTION public.is_case_owner(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.cases WHERE id = _case_id AND user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_case_client(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.case_clients cc
    JOIN public.clients c ON c.id = cc.client_id
    WHERE cc.case_id = _case_id AND c.user_id = auth.uid()
  );
$function$;

-- Tabela: clients --------------------------------------------------------
-- Cliente final (pessoa física/jurídica) que pode ter uma conta própria
-- (user_id) vinculada por convite, para acessar o portal.

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  user_id UUID UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  invite_status TEXT NOT NULL DEFAULT 'pending' CHECK (invite_status = ANY (ARRAY['pending'::text, 'sent'::text])),
  invited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their clients"
ON public.clients FOR SELECT
USING (auth.uid() = owner_id OR auth.uid() = user_id);

CREATE POLICY "Owners can create clients"
ON public.clients FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their clients"
ON public.clients FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their clients"
ON public.clients FOR DELETE
USING (auth.uid() = owner_id);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: case_clients -----------------------------------------------------
-- Relação N:N entre casos e clientes com acesso ao portal.

CREATE TABLE public.case_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved parties can view case_clients"
ON public.case_clients FOR SELECT
USING (public.is_case_owner(case_id) OR public.is_case_client(case_id));

CREATE POLICY "Owners can manage case_clients"
ON public.case_clients FOR INSERT
WITH CHECK (public.is_case_owner(case_id));

CREATE POLICY "Owners can update case_clients"
ON public.case_clients FOR UPDATE
USING (public.is_case_owner(case_id));

CREATE POLICY "Owners can delete case_clients"
ON public.case_clients FOR DELETE
USING (public.is_case_owner(case_id));

-- Tabela: case_timeline_events ---------------------------------------------
-- Linha do tempo do caso. `internal_note` só é lida pelo advogado;
-- `visible_to_client` controla o que aparece no portal do cliente.

CREATE TABLE public.case_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id),
  created_by UUID,
  publication_id UUID REFERENCES public.publications(id),
  source public.timeline_event_source NOT NULL DEFAULT 'manual',
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  client_summary TEXT NOT NULL,
  internal_note TEXT,
  visible_to_client BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage timeline events"
ON public.case_timeline_events FOR ALL
USING (public.is_case_owner(case_id))
WITH CHECK (public.is_case_owner(case_id));

CREATE POLICY "Clients can view visible timeline events"
ON public.case_timeline_events FOR SELECT
USING (visible_to_client = true AND public.is_case_client(case_id));

CREATE TRIGGER update_case_timeline_events_updated_at
  BEFORE UPDATE ON public.case_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: client_requests ---------------------------------------------------
-- Solicitações do escritório para o cliente (documento, assinatura, etc).

CREATE TABLE public.client_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id),
  created_by UUID NOT NULL,
  type public.client_request_type NOT NULL DEFAULT 'document',
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status public.client_request_status NOT NULL DEFAULT 'pending',
  fulfilled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage requests"
ON public.client_requests FOR ALL
USING (public.is_case_owner(case_id))
WITH CHECK (public.is_case_owner(case_id));

CREATE POLICY "Clients can view their requests"
ON public.client_requests FOR SELECT
USING (public.is_case_client(case_id));

CREATE POLICY "Clients can mark their requests fulfilled"
ON public.client_requests FOR UPDATE
USING (public.is_case_client(case_id));

CREATE TRIGGER update_client_requests_updated_at
  BEFORE UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: client_documents ---------------------------------------------------
-- Documentos trocados entre escritório e cliente dentro de um caso,
-- opcionalmente atendendo a uma client_request.

CREATE TABLE public.client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id),
  uploaded_by_user_id UUID NOT NULL,
  uploaded_by public.client_document_uploader NOT NULL,
  category TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  status public.client_document_status NOT NULL DEFAULT 'received',
  ai_summary TEXT,
  request_id UUID REFERENCES public.client_requests(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved parties can view documents"
ON public.client_documents FOR SELECT
USING (public.is_case_owner(case_id) OR public.is_case_client(case_id));

CREATE POLICY "Involved parties can upload documents"
ON public.client_documents FOR INSERT
WITH CHECK (
  (public.is_case_owner(case_id) AND uploaded_by = 'lawyer'::public.client_document_uploader)
  OR (public.is_case_client(case_id) AND uploaded_by = 'client'::public.client_document_uploader)
);

CREATE POLICY "Owners can update documents"
ON public.client_documents FOR UPDATE
USING (public.is_case_owner(case_id));

CREATE POLICY "Owners can delete documents"
ON public.client_documents FOR DELETE
USING (public.is_case_owner(case_id));

-- Notificações automáticas ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_owner_on_client_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id UUID;
  v_case_title TEXT;
BEGIN
  IF NEW.uploaded_by = 'client' THEN
    SELECT user_id, title INTO v_owner_id, v_case_title FROM public.cases WHERE id = NEW.case_id;
    IF v_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, link_tab)
      VALUES (v_owner_id, 'Cliente enviou um documento', COALESCE(v_case_title, 'Caso') || ': ' || NEW.file_name, 'cases');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER notify_owner_on_client_document
  AFTER INSERT ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_client_document();

CREATE OR REPLACE FUNCTION public.notify_owner_on_request_fulfilled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NEW.status = 'fulfilled' AND OLD.status IS DISTINCT FROM 'fulfilled' THEN
    SELECT user_id INTO v_owner_id FROM public.cases WHERE id = NEW.case_id;
    IF v_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, link_tab)
      VALUES (v_owner_id, 'Cliente respondeu uma solicitação', NEW.title, 'cases');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER notify_owner_on_request_fulfilled
  AFTER UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_request_fulfilled();

-- Storage: bucket privado para documentos do cliente -------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Involved parties can view client document files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-documents'
  AND (public.is_case_owner(((storage.foldername(name))[1])::uuid) OR public.is_case_client(((storage.foldername(name))[1])::uuid))
);

CREATE POLICY "Involved parties can upload client document files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents'
  AND (public.is_case_owner(((storage.foldername(name))[1])::uuid) OR public.is_case_client(((storage.foldername(name))[1])::uuid))
);

CREATE POLICY "Owners can delete client document files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-documents'
  AND public.is_case_owner(((storage.foldername(name))[1])::uuid)
);
