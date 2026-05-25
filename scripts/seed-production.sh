#!/usr/bin/env bash
set -euo pipefail
: "${API_URL:?API_URL obrigatório}"
: "${ADMIN_API_KEY:?ADMIN_API_KEY obrigatório}"
curl -fsS -X POST "$API_URL/admin/seed-production" -H "content-type: application/json" -H "x-admin-key: $ADMIN_API_KEY" -d '{}'
