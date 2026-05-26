# Plano Multi-Tenant do PDV Pro

## Objetivo

Transformar o PDV Pro em um SaaS multi-cliente usando um unico banco PostgreSQL para multiplos estabelecimentos.

Cada loja deve visualizar e operar somente os proprios dados. A separacao futura sera feita por `storeId` nas tabelas de negocio.

## Arquitetura desejada

- Um frontend principal para todos os clientes.
- Um backend principal para todos os clientes.
- Um banco PostgreSQL unico com varias lojas.
- Cada usuario pertence a uma ou mais lojas por meio de `store_members`.
- Cada endpoint de negocio devera resolver a loja atual e filtrar dados por `storeId`.

## O que este PR faz

- Cria a tabela `stores`.
- Cria a tabela `users`.
- Cria a tabela `store_members`.
- Exporta o schema de tenancy no barrel de schemas.
- Adiciona migration versionada com a loja padrao `default-store`.

## O que este PR nao faz

Este PR nao altera o comportamento operacional atual.

Nao altera pedidos, cozinha, rotas, caixa, dashboard, alertas, cardapio, clientes, motoboys, mesas, configuracoes atuais ou frontend operacional.

Tambem nao implementa autenticacao completa, selecao de loja ou filtros obrigatorios por `storeId`.

## Loja padrao de compatibilidade

A migration cria uma loja padrao de forma idempotente:

- Nome: `Loja Padrao`
- Slug: `default-store`
- Status: `active`

Essa loja sera usada nos proximos PRs para migrar os dados atuais do ambiente single-tenant sem quebrar o fluxo existente.

## Regra futura obrigatoria

Toda tabela de negocio que pertence a uma loja devera ter `storeId` ou isolamento garantido por uma FK que leve ate uma entidade com `storeId`.

Tabelas que deverao ser migradas nas proximas fases:

- `store_settings`
- `categories`
- `products`
- `customers`
- `tables`
- `couriers`
- `orders`
- `order_items`
- `payments`
- `cash_registers`
- `cash_movements`
- `kitchen_tickets`
- `delivery_routes`
- `delivery_route_orders`
- `delivery_distance_cache`

## Riscos principais

Sem isolamento por loja, um SaaS com banco unico pode gerar vazamento ou mistura de dados entre clientes, como pedidos, dashboard, caixa, cozinha, rotas, cardapio e integracoes externas.

## Ordem recomendada dos proximos PRs

1. Adicionar `storeId` em configuracoes e cadastros base.
2. Adicionar `storeId` em pedidos, itens, pagamentos e cozinha.
3. Adicionar `storeId` em caixa e movimentos financeiros.
4. Adicionar `storeId` em rotas, vinculos de rota e cache de distancia.
5. Criar backfill para associar dados existentes a `default-store`.
6. Aplicar filtros obrigatorios por `storeId` no backend.
7. Criar contexto de loja atual no frontend.
8. Implementar testes de isolamento entre Loja A e Loja B.
9. Revisar rotas admin/dev para operarem com escopo seguro em producao.

## Criterio de sucesso futuro

Uma loja deve conseguir criar pedidos, abrir caixa, usar cozinha, gerar rotas, receber pagamentos e ver dashboard sem acessar qualquer dado de outra loja.
