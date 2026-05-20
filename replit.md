# Restaurant PDV Pro

Sistema completo de PDV (Ponto de Venda) para restaurantes, em Português do Brasil.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Wouter, TanStack Query, shadcn/ui, Recharts
- QR codes: qrcode.react

## Where things live

- `lib/db/src/schema/` — source of truth for DB schema (orders, tables, customers, menu, kitchen, cash, delivery, settings)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas (from codegen)
- `lib/api-client-react/src/generated/` — generated React Query hooks (from codegen)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/restaurant-pdv/src/pages/` — React pages (frontend)
- `artifacts/restaurant-pdv/src/components/` — shared UI components

## Architecture decisions

- `needsChange` and `changeFor` stored as `text`/`numeric` in DB; always convert via `String()` / `parseFloat(String(...))` when reading/writing.
- `paymentTiming` field on orders: `"now"` = paid at order creation; `"on_delivery"` = courier collects payment.
- `storeSettingsTable` is a singleton row — always use `getOrCreateSettings()` from `settings.ts`.
- `dispatchDeadline` on delivery routes = `createdAt + deliveryDispatchTimeMinutes` (from settings).
- Backend routes do NOT use `zod/v4` directly — use manual validation (parseInt, typeof checks). api-server doesn't have zod as direct dep.
- Delivery eligibility for routing: orders with `deliveryStatus IN ('preparing', 'ready')`.
- Do NOT use `console.log` in server — use `req.log` (in handlers) or `logger` (outside handlers).

## Product

- **Dashboard**: resumo de vendas, pedidos recentes, gráficos por categoria
- **Caixa**: abertura/fechamento, sangria/suprimento, histórico de movimentos
- **Pedidos**: lista completa com filtros, criação, detalhes, cozinha
- **Mesas**: mapa visual, ocupação, status em tempo real
- **Cozinha**: fila de pedidos com timers e alertas de atraso
- **Cardápio**: categorias e produtos com imagem, preço, ativo/inativo
- **Clientes**: cadastro com histórico e endereço para delivery
- **Pagamentos**: múltiplas formas, divisão de conta, gorjeta
- **Rotas**: painel de rotas para motoboys com QR code Google Maps, alertas de prazo (verde/amarelo/vermelho), ajuste de ±5 min, pagamento na entrega por pedido
- **Configurações**: dados da loja e parâmetros de entrega (tempo de despacho, limite de pedidos por rota)

## User preferences

- Interface em Português do Brasil
- Preços em BRL (R$)
- Foco em restaurantes de Curitiba/PR como caso de uso padrão

## Gotchas

- Preços no DB são `numeric` — sempre `parseFloat(String(value))` antes de enviar como JSON
- `pnpm --filter @workspace/db run push` antes de reiniciar o servidor após mudanças de schema
- `pnpm --filter @workspace/api-spec run codegen` após alterar o OpenAPI spec
- `needsChange` no DB é `text` ("true"/"false"), não boolean — converter ao inserir: `String(boolValue)`
- `changeFor` no DB é `numeric` text — converter ao inserir: `String(numberValue)`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
