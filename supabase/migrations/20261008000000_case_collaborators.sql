-- Colaboradores: permite ao dono da conta (advogado) dar acesso a OUTRO
-- advogado/estagiário a processos específicos do escritório, sem que ele
-- veja os demais processos. Pedido explícito do usuário (vamos cadastrar
-- um novo advogado e atribuir só os processos trabalhistas de um
-- cliente), desenhado como recurso geral e reutilizável — não específico
-- para uma única pessoa.
--
-- O dono continua sendo o único "cases.user_id" — o colaborador nunca é
-- dono, só ganha acesso adicional via case_collaborators. Isso faz a regra
-- "só vejo o que sou dono OU colaborador" cair naturalmente das policies
-- abaixo, sem precisar de um "papel restrito" separado: quem não é dono
-- nem colaborador de um processo simplesmente não aparece em nenhuma
-- consulta (RLS).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
COMMENT ON COLUMN public.profiles.cpf IS 'CPF do usuário (opcional) — usado para colaboradores/advogados cadastrados pelo escritório via invite-collaborator.';

-- Função de cadastro (handle_new_user) passa a também copiar o cpf, quando
-- enviado em raw_user_meta_data pela edge function de convite.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_name text;
  safe_cpf text;
BEGIN
  safe_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'User');
  IF length(safe_name) > 100 THEN
    safe_name := substring(safe_name from 1 for 100);
  END IF;
  safe_name := regexp_replace(safe_name, '<[^>]*>', '', 'g');

  safe_cpf := nullif(trim(new.raw_user_meta_data->>'cpf'), '');
  IF safe_cpf IS NOT NULL AND length(safe_cpf) > 20 THEN
    safe_cpf := substring(safe_cpf from 1 for 20);
  END IF;

  INSERT INTO public.profiles (user_id, full_name, company_id, cpf)
  VALUES (new.id, safe_name, null, safe_cpf);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user');

  RETURN new;
END;
$$;

-- Tabela: case_collaborators ----------------------------------------------
-- Concede a um usuário (colaborador) acesso a um processo específico de
-- outro dono, sem transferir a titularidade.

CREATE TABLE public.case_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  collaborator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (case_id, collaborator_user_id)
);

COMMENT ON TABLE public.case_collaborators IS 'Acesso de um colaborador a um processo específico — complementar a cases.user_id, que continua sendo o dono.';

CREATE INDEX idx_case_collaborators_collaborator ON public.case_collaborators(collaborator_user_id);
CREATE INDEX idx_case_collaborators_case ON public.case_collaborators(case_id);

ALTER TABLE public.case_collaborators ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_case_collaborator(_case_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.case_collaborators
    WHERE case_id = _case_id AND collaborator_user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_case_collaborator(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_case_collaborator(uuid) TO authenticated, service_role;

CREATE POLICY "Owners can view case_collaborators of their cases"
ON public.case_collaborators FOR SELECT TO authenticated
USING (public.is_case_owner(case_id) OR collaborator_user_id = auth.uid());

CREATE POLICY "Owners can add collaborators to their cases"
ON public.case_collaborators FOR INSERT TO authenticated
WITH CHECK (public.is_case_owner(case_id) AND assigned_by = auth.uid());

CREATE POLICY "Owners can remove collaborators from their cases"
ON public.case_collaborators FOR DELETE TO authenticated
USING (public.is_case_owner(case_id));

-- cases: colaborador passa a ver e editar (não apagar, não criar) os
-- processos atribuídos, além dos próprios. --------------------------------

DROP POLICY IF EXISTS "Users can view their own cases" ON public.cases;
CREATE POLICY "Users can view their own cases" ON public.cases
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_case_collaborator(id));

DROP POLICY IF EXISTS "Users can update their own cases" ON public.cases;
CREATE POLICY "Users can update their own cases" ON public.cases
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_case_collaborator(id));

-- Trava: titularidade do processo (cases.user_id) nunca muda numa edição
-- comum — fecha a brecha de um colaborador se autodeclarar dono através
-- de um UPDATE (a policy acima não tem WITH CHECK restringindo colunas).
CREATE OR REPLACE FUNCTION public.prevent_case_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_case_owner_change() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_case_owner_change ON public.cases;
CREATE TRIGGER prevent_case_owner_change
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.prevent_case_owner_change();

-- events (Agenda): prazos/compromissos ligados a um processo compartilhado
-- aparecem para o colaborador também — e para o dono, mesmo que o evento
-- tenha sido criado pelo colaborador (visibilidade por processo, não só
-- por quem criou cada linha). ----------------------------------------------

DROP POLICY IF EXISTS "Users can view their own events" ON public.events;
CREATE POLICY "Users can view their own events" ON public.events
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (case_id IS NOT NULL AND (public.is_case_owner(case_id) OR public.is_case_collaborator(case_id)))
  );

DROP POLICY IF EXISTS "Users can create their own events" ON public.events;
CREATE POLICY "Users can create their own events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (case_id IS NULL OR public.is_case_owner(case_id) OR public.is_case_collaborator(case_id))
  );

DROP POLICY IF EXISTS "Users can update their own events" ON public.events;
CREATE POLICY "Users can update their own events" ON public.events
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (case_id IS NOT NULL AND (public.is_case_owner(case_id) OR public.is_case_collaborator(case_id)))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (case_id IS NOT NULL AND (public.is_case_owner(case_id) OR public.is_case_collaborator(case_id)))
  );

-- publications: mesma lógica de acesso por processo. -----------------------

DROP POLICY IF EXISTS "Users can view their own publications" ON public.publications;
CREATE POLICY "Users can view their own publications" ON public.publications
  FOR SELECT
  USING (auth.uid() = user_id OR (case_id IS NOT NULL AND public.is_case_collaborator(case_id)));

DROP POLICY IF EXISTS "Users can update their own publications" ON public.publications;
CREATE POLICY "Users can update their own publications" ON public.publications
  FOR UPDATE
  USING (auth.uid() = user_id OR (case_id IS NOT NULL AND public.is_case_collaborator(case_id)));

-- publication_followups: segue a visibilidade da publicação. ---------------

DROP POLICY IF EXISTS "Users can view followups of their publications" ON public.publication_followups;
CREATE POLICY "Users can view followups of their publications" ON public.publication_followups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.publications p
      WHERE p.id = publication_id
        AND (p.user_id = auth.uid() OR (p.case_id IS NOT NULL AND public.is_case_collaborator(p.case_id)))
    )
  );

DROP POLICY IF EXISTS "Users can create followups on their publications" ON public.publication_followups;
CREATE POLICY "Users can create followups on their publications" ON public.publication_followups
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.publications p
      WHERE p.id = publication_id
        AND (p.user_id = auth.uid() OR (p.case_id IS NOT NULL AND public.is_case_collaborator(p.case_id)))
    )
  );

-- publication_attachments + storage: colaborador pode ver/subir anexos
-- (não apagar) das publicações dos processos atribuídos. -------------------

CREATE OR REPLACE FUNCTION public.is_publication_collaborator(_publication_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.publications p
    WHERE p.id = _publication_id
      AND p.case_id IS NOT NULL
      AND public.is_case_collaborator(p.case_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.is_publication_collaborator(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_publication_collaborator(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Owners can view publication attachments" ON public.publication_attachments;
CREATE POLICY "Owners can view publication attachments" ON public.publication_attachments
  FOR SELECT
  USING (public.is_publication_owner(publication_id) OR public.is_publication_collaborator(publication_id));

DROP POLICY IF EXISTS "Owners can add publication attachments" ON public.publication_attachments;
CREATE POLICY "Owners can add publication attachments" ON public.publication_attachments
  FOR INSERT
  WITH CHECK (public.is_publication_owner(publication_id) OR public.is_publication_collaborator(publication_id));

DROP POLICY IF EXISTS "Owners can view publication attachment files" ON storage.objects;
CREATE POLICY "Owners can view publication attachment files" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'publication-attachments'
    AND (
      public.is_publication_owner(((storage.foldername(name))[1])::uuid)
      OR public.is_publication_collaborator(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "Owners can upload publication attachment files" ON storage.objects;
CREATE POLICY "Owners can upload publication attachment files" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'publication-attachments'
    AND (
      public.is_publication_owner(((storage.foldername(name))[1])::uuid)
      OR public.is_publication_collaborator(((storage.foldername(name))[1])::uuid)
    )
  );

-- publication_stage_history: visível para quem pode ver a publicação (dono
-- ou colaborador), não só quem criou a publicação originalmente. ----------

DROP POLICY IF EXISTS "Users can view their own publication stage history" ON public.publication_stage_history;
CREATE POLICY "Users can view their own publication stage history" ON public.publication_stage_history
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_publication_collaborator(publication_id));
