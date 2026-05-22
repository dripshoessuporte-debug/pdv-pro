# Segurança operacional mínima (P0-Infra)

## Rotas de desenvolvimento
- Rotas `/dev/*` ficam **desativadas por padrão**.
- Para ativar localmente: `ENABLE_DEV_ROUTES=true`.
- Rotas destrutivas exigem header `x-admin-key`.
- `x-admin-key` deve corresponder a `ADMIN_RESET_KEY` ou `ADMIN_API_KEY`.

## Inbound de integrações
- `POST /integrations/orders/inbound` exige `INTEGRATION_API_KEY` configurada no backend.
- Header obrigatório: `x-integration-key` com valor idêntico ao secret.
- Nunca deixar `INTEGRATION_API_KEY` vazia em produção.

## Secrets e versionamento
- Nunca versionar `.env` com valores reais.
- Use `.env.example` somente com placeholders.
- Nunca expor `OPENROUTESERVICE_API_KEY` no frontend.
