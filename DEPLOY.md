# Deploy recomendado (P0-Infra + P1 base demo)

## Topologia
- **Frontend (artifacts/restaurant-pdv)**: Vercel.
- **Backend Express (artifacts/api-server)**: Render, Railway ou Fly.io (processo contínuo com `app.listen`).
- **PostgreSQL**: Neon ou Supabase.

## Fluxo de deploy
1. Provisionar banco Neon/Supabase e definir `DATABASE_URL` no backend.
2. Rodar migrations versionadas com Drizzle (`db:generate` + `db:migrate`).
3. Deploy do backend com variáveis de ambiente obrigatórias.
4. Deploy do frontend na Vercel, apontando para URL pública do backend.

## Variáveis de ambiente
Use `.env.example` como referência e configure no provedor:
- `DATABASE_URL`
- `PORT`
- `NODE_ENV`
- `LOG_LEVEL`
- `OPENROUTESERVICE_API_KEY`
- `INTEGRATION_API_KEY` (**obrigatória** para inbound)
- `ADMIN_API_KEY`
- `ADMIN_RESET_KEY`
- `ENABLE_DEV_ROUTES` (default seguro: `false`)
- `BASE_PATH` (opcional)
- `REPL_ID` (opcional)

## Frontend Vercel + backend separado
- O frontend não deve conter secrets de backend.
- Configure no frontend apenas endpoint público da API.
- `OPENROUTESERVICE_API_KEY`, `INTEGRATION_API_KEY` e chaves admin ficam só no backend.

## Banco e migrations
- Scripts Drizzle em `lib/db/package.json`.
- Histórico de migrations em `lib/db/drizzle/`.
- Não usar `db push` em produção.

## Operação demo/produção
- Demo: `scripts/seed-demo.sh` e `scripts/clear-demo.sh`.
- Produção: `scripts/reset-production.sh` (destrutivo) e `scripts/seed-production.sh` (bloqueado por padrão).
