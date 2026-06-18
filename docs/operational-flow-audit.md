# Auditoria operacional P0 — Gestor Max

## Regra validada
Pagamento é financeiro e não encerra o pedido. O pedido só fica `closed` após estar pronto/entregue conforme o fluxo e quitado.

## Checklist dos fluxos reais

| Fluxo | Passo | Resultado esperado | Endpoint/tela | Conferir |
| --- | --- | --- | --- | --- |
| A Balcão com cozinha | Abrir caixa, criar pedido balcão, adicionar item, enviar cozinha, marcar pronto, pagar, finalizar | Status `open → preparing → ready → closed`; financeiro `unpaid → paid` | Caixa, Pedido, Cozinha, Pagamento, `POST /orders/:id/finalize` | Caixa registra payment; cozinha tem ticket; mesa não aplicável |
| B Pago antes da cozinha | Criar pedido, adicionar item, pagar, enviar cozinha, pronto, finalizar | Pagamento preenche `paidAt` sem fechar; botão cozinha continua ativo | Pedido, Pagamento, `POST /payments`, `POST /orders/:id/send-to-kitchen` | Diagnóstico sem anomalia após envio |
| C Pago e editado | Item R$ 50, pagar, adicionar item R$ 10, cobrar diferença | `outstandingAmount` vira 10; pagamento complementar não duplica valor anterior | Pedido, Pagamento, `GET /orders/:id` | Caixa tem movimentos separados; financeiro volta a `paid` |
| D Mesa/comanda | Abrir comanda, enviar cozinha, adicionar mais item, pagar, finalizar | Novo item em `preparing` gera ticket pendente sem duplicar fechamento | Mesas, Pedido, Cozinha | Mesa libera apenas no `closed` |
| E Delivery pago agora | Criar delivery `paymentTiming=now`, pagar, cozinha, pronto, rota, entregue, finalizar | Pagamento não fecha antes da cozinha; delivery avança status próprios | Delivery, Cozinha, Rotas | Caixa e dashboard batem com pagamentos |
| F Delivery pagar na entrega | Criar delivery `on_delivery`, cozinha, rota, entrega, baixa financeira, finalizar | Finalização bloqueia sem baixa financeira/pagamento | Delivery, Rotas, Caixa | Cash movement existe antes do closed |
| G Cancelamento | Cancelar aberto/preparando/pago/em rota | Não apaga pagamentos; mensagens seguras indicam estorno/ajuste manual quando necessário | Pedido/Delivery | Financeiro não some do caixa |
| H Caixa | Abrir caixa, receber dinheiro/pix/crédito, cobrar diferença, fechar caixa | Movimentos financeiros refletem cada pagamento aprovado | Caixa, `POST /payments` | Total vendido e expectedCash consistentes |
| I Permissões | Testar max_control, atendente, cozinha, motoboy | Reparo legado só max_control; atendente respeita plantão; cozinha só muda preparo | Endpoints operacionais | 403/409 esperados por papel |

## Endpoints de auditoria

- `GET /api/orders/:id/flow-diagnostics`: mostra status operacional, financeiro, permissões calculadas e avisos.
- `GET /api/orders/flow-anomalies`: lista anomalias por loja.
- `POST /api/orders/:id/reopen-paid-for-kitchen`: reparo manual de legado pago/fechado antes da cozinha, apenas `max_control`.

## Pós-merge recomendado

1. Rodar migrações se houver `DATABASE_URL`: `pnpm --filter @workspace/db db:migrate`.
2. Executar o smoke manual dos fluxos A-I em uma loja de homologação.
3. Consultar `GET /api/orders/flow-anomalies` e corrigir legados caso a caso.
