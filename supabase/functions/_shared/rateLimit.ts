// Shared per-user AI rate limiting for edge functions that call an LLM.
//
// Backed by the `check_and_log_rate_limit` SQL function (see migration
// 20260901113743_shared_ai_rate_limit.sql), which checks the request count
// and records this request atomically in a single call — avoiding the
// check-then-insert race that a plain SELECT-then-INSERT from the edge
// function would have under concurrent requests from the same user.
//
interface RpcCapableClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export async function checkAndLogRateLimit(
  supabase: RpcCapableClient,
  userId: string,
  functionName: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; error?: unknown }> {
  const { data, error } = await supabase.rpc("check_and_log_rate_limit", {
    p_user_id: userId,
    p_function: functionName,
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fail open on infra errors (don't block the feature because logging
    // failed), but surface the error so the caller can log it.
    return { allowed: true, error };
  }

  return { allowed: data === true };
}
