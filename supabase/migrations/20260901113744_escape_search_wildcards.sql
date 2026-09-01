-- search_users_for_sharing interpolated the caller-supplied search term
-- directly into an ILIKE '%...%' pattern without escaping LIKE wildcard
-- characters (% and _), letting a search term broaden matches beyond a
-- literal substring (e.g. "___" matches any 3+ character name). Impact was
-- low (results capped at 10, only non-sensitive profile fields exposed) but
-- worth closing.
CREATE OR REPLACE FUNCTION public.search_users_for_sharing(search_term text)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.user_id != auth.uid()
    AND length(trim(coalesce(search_term, ''))) >= 3
    AND (p.full_name ILIKE '%' || replace(replace(search_term, '%', '\%'), '_', '\_') || '%' ESCAPE '\')
  LIMIT 10;
$$;
