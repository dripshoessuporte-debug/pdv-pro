# Production Readiness — Gestor Max

Checklist base antes de hospedar em Railway/Neon.

## Antes de hospedar

- Configurar a `DATABASE_URL` do Neon no ambiente da API.
- Configurar `SESSION_SECRET` forte, longo e exclusivo de produção.
- Configurar `APP_PUBLIC_URL` com a URL pública final do app.
- Configurar o webhook Cakto apontando para a URL final de produção.
- Configurar as URLs de checkout Cakto para os planos Start, Delivery e Pro.
- Rodar as migrations no banco de produção.
- Criar o platform owner inicial.
- Testar login do Admin Max.
- Testar solicitação manual via página pública de planos/cadastro.
- Testar aprovação/liberação de teste no Admin Max.
- Testar ativação manual no Admin Max.
- Testar criação de loja nova pelo link de ativação.
- Testar fluxo de pedido/cozinha/caixa antes de liberar operação real.

## Variáveis obrigatórias

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_PUBLIC_URL`

## Variáveis Cakto

- `CAKTO_WEBHOOK_SECRET`
- `CAKTO_CHECKOUT_START_URL`
- `CAKTO_CHECKOUT_DELIVERY_URL`
- `CAKTO_CHECKOUT_PRO_URL`

## Admin inicial

- `PLATFORM_OWNER_EMAIL`
- `PLATFORM_OWNER_PASSWORD`
- `PLATFORM_OWNER_NAME`

## Teste mínimo do Admin Max

1. Acessar `/admin-max/login`.
2. Em development, usar `dono@gestormax.local` / `admin123` quando o seed/local bootstrap estiver habilitado.
3. Criar uma solicitação em `/plans` ou `/register`.
4. Abrir `/admin-max/billing` e confirmar que a solicitação aparece.
5. Clicar em **Liberar teste** e confirmar modal com link de ativação, status `approved` e entitlement `trialing`.
6. Criar outra solicitação, clicar em **Ativar** e confirmar modal com link, status `converted` e entitlement `active`.
7. Criar outra solicitação, clicar em **Rejeitar** e confirmar status `rejected`.
8. Tentar aprovar novamente uma solicitação já processada e validar erro claro no painel.
9. Abrir `/api/platform/access-requests/:id/debug` para investigar bloqueios.
10. Abrir `/api/platform/admin-readiness` e conferir tabelas/envs booleanos sem exposição de secrets.
