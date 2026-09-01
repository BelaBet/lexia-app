-- Extend the per-user AI rate limit to cover pdf-ocr and suggest-checklist-items
-- too (previously only legal-chat was throttled), and make the check+record
-- step atomic so concurrent requests from the same user can't all slip past
-- the limit at once (the old check-then-insert from the edge function was two
-- separate round trips with no lock between them).

ALTER TABLE public.legal_chat_requests
  ADD COLUMN IF NOT EXISTS function_name text NOT NULL DEFAULT 'legal-chat';

CREATE INDEX IF NOT EXISTS idx_legal_chat_requests_user_fn_created
  ON public.legal_chat_requests (user_id, function_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.check_and_log_rate_limit(
  p_user_id uuid,
  p_function text,
  p_max integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Callers can only check/log their own rate limit, never someone else's
  -- (this function is granted to `authenticated`, so any logged-in user can
  -- call it directly, not just through an edge function).
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Serialize concurrent calls for the same user+function so the
  -- count-then-insert below can't race across concurrent requests from the
  -- same user (e.g. a double-click or a retry storm).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_function, 0));

  SELECT count(*) INTO v_count
  FROM public.legal_chat_requests
  WHERE user_id = p_user_id
    AND function_name = p_function
    AND created_at >= now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.legal_chat_requests (user_id, function_name) VALUES (p_user_id, p_function);
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_log_rate_limit(uuid, text, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.check_and_log_rate_limit(uuid, text, integer, integer) TO authenticated;
