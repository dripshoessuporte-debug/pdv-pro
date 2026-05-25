# Segurança operacional mínima (P0-Infra)

## Rotas de desenvolvimento
- Rotas `/dev/*` são protegidas por `ENABLE_DEV_ROUTES=true`.
- Valor padrão é `false`; em produção devem ficar desativadas.
- Ações sensíveis exigem `x-admin-key` com `ADMIN_API_KEY` ou `ADMIN_RESET_KEY`.

## Inbound obrigatório por chave
- `POST /integrations/orders/inbound` exige `INTEGRATION_API_KEY` configurada.
- Header obrigatório: `x-integration-key` igual ao secret.
- Se `INTEGRATION_API_KEY` ausente/vazia, endpoint responde erro e não processa pedidos.

## Endpoints administrativos
- `/admin/seed-demo` e `/admin/clear-demo`: apenas ambiente com dev routes habilitadas e admin key.
- `/admin/reset-production`: destrutivo, requer admin key.
- `/admin/seed-production`: bloqueado por padrão para evitar carga indevida.

## Segredos e exposição
- Nunca versionar `.env` com valores reais.
- Use apenas placeholders em `.env.example`.
- Não expor `OPENROUTESERVICE_API_KEY`, `INTEGRATION_API_KEY` ou chaves admin no frontend (Vercel).
