#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE_HEADER="${COOKIE_HEADER:-}"

if [[ -z "$COOKIE_HEADER" ]]; then
  cat <<MSG
Defina COOKIE_HEADER com o cookie de sessão antes de rodar.
Exemplo:
  COOKIE_HEADER='Cookie: connect.sid=...' BASE_URL=http://localhost:3000 $0
MSG
  exit 2
fi

curl_json() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "$BASE_URL$path" -H "$COOKIE_HEADER" -H 'Content-Type: application/json' -d "$body"
  else
    curl -fsS -X "$method" "$BASE_URL$path" -H "$COOKIE_HEADER"
  fi
}

echo "1) Crie pedido pela UI ou API e exporte ORDER_ID=<id>."
: "${ORDER_ID:?ORDER_ID obrigatório para diagnóstico}"

echo "Diagnóstico do pedido $ORDER_ID"
curl_json GET "/api/orders/$ORDER_ID/flow-diagnostics"

echo "Anomalias da loja"
curl_json GET "/api/orders/flow-anomalies"
