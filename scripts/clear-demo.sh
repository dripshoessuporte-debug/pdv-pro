#!/usr/bin/env bash
set -euo pipefail
: "${API_URL:=http://localhost:3000}"
: "${ADMIN_API_KEY:?ADMIN_API_KEY obrigatório}"
curl -fsS -X POST "$API_URL/admin/clear-demo" -H "content-type: application/json" -H "x-admin-key: $ADMIN_API_KEY" -d '{}'
