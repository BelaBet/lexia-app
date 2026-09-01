#!/usr/bin/env bash
# Smoke test for the 7 Supabase edge functions on the standalone (non-Lovable)
# backend. Run this from a machine with normal internet access (e.g. your own
# PC) — Claude's sandbox could not reach *.supabase.co directly to run it.
#
# Usage:
#   chmod +x scripts/smoke-test-edge-functions.sh
#   ./scripts/smoke-test-edge-functions.sh
#
# Expected results:
#   - OPTIONS (CORS preflight): status 200 or 204, with
#     Access-Control-Allow-Origin present in the response headers.
#   - POST with no Authorization header: status 401 for every function
#     except create-checkout/check-subscription/customer-portal which may
#     return 401 or 500 depending on whether STRIPE_SECRET_KEY is set yet.
#   - Any 000, 502, 503 or connection error means the function is not
#     reachable or crashed — investigate with `supabase functions logs <name>`.

set -uo pipefail

BASE="https://dtpyeytvawomzkcihmsy.supabase.co/functions/v1"
ORIGIN="https://lexia-app-rho.vercel.app"

FUNCTIONS=(legal-chat pdf-ocr suggest-checklist-items admin-update-role check-subscription create-checkout customer-portal)

pass=0
fail=0

for fn in "${FUNCTIONS[@]}"; do
  echo "=================================================="
  echo "Function: $fn"

  echo "-- OPTIONS (CORS preflight) --"
  cors_status=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/$fn" \
    -H "Origin: $ORIGIN" -H "Access-Control-Request-Method: POST")
  echo "status=$cors_status"
  if [[ "$cors_status" == "200" || "$cors_status" == "204" ]]; then
    pass=$((pass+1))
  else
    echo "  !! unexpected CORS preflight status"
    fail=$((fail+1))
  fi

  echo "-- POST without Authorization header (expect 401) --"
  body_status=$(curl -s -X POST "$BASE/$fn" -H "Content-Type: application/json" -d '{}' -w "\nHTTP_STATUS:%{http_code}\n")
  echo "$body_status"
  status_line=$(echo "$body_status" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
  if [[ "$status_line" == "401" ]]; then
    pass=$((pass+1))
  else
    echo "  !! expected 401, got $status_line (ok if this is one of the Stripe functions and STRIPE_SECRET_KEY isn't set yet)"
    fail=$((fail+1))
  fi
  echo
done

echo "=================================================="
echo "Summary: $pass checks passed, $fail need a look"
