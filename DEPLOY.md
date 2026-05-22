# Deploy recomendado (PDV Pro)

## Arquitetura recomendada
- **Frontend**: Vercel
- **Backend Express**: Render, Railway ou Fly.io
- **Banco PostgreSQL**: Neon ou Supabase
- **Repositório**: GitHub

## Motivo
O backend atual usa processo Express contínuo (`app.listen`). Sem adaptação para serverless/functions, Vercel não é o destino ideal para a API.

## Banco de dados
- Configure `DATABASE_URL` para a instância PostgreSQL gerenciada (Neon/Supabase).
- Mantenha schema e migrations no GitHub.
- Em produção, use migrations versionadas.
- **Não use `db push` em produção**.

## Variáveis de ambiente
Configure no provedor (Render/Railway/Fly/Vercel/Replit):
- `DATABASE_URL`
- `PORT` (backend)
- `NODE_ENV`
- `LOG_LEVEL`
- `OPENROUTESERVICE_API_KEY`
- `INTEGRATION_API_KEY`
- `ADMIN_API_KEY`
- `ADMIN_RESET_KEY`
- `ENABLE_DEV_ROUTES`
- `BASE_PATH` (frontend, opcional)
- `REPL_ID` (apenas contexto Replit)

## Segurança operacional
- Rotas `/dev/*` ficam desativadas por padrão (`ENABLE_DEV_ROUTES=false`).
- Inbound externo exige `x-integration-key` válido.
- Nunca versionar `.env` com valores reais.
