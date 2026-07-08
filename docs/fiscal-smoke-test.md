# Smoke test fiscal mockado

A suíte `test:fiscal-smoke` valida localmente os principais fluxos internos de NFC-e sem usar a API real da Focus NFe.

## Comando

```bash
pnpm --filter @workspace/api-server test:fiscal-smoke
```

## O que valida

A suíte monta cenários em memória com mocks/stubs e valida que o fluxo interno consegue gerar payloads NFC-e para:

1. Pedido simples.
2. Pedido simples com item fiscal separado `Taxa de entrega`.
3. Pedido Multisabor.
4. Pedido Multisabor com taxa de entrega.
5. Pedido com pagamento externo/marketplace.
6. Pedido misto com produto simples, Multisabor, taxa de entrega e pagamento externo.
7. Produção sem readiness bloqueada localmente.
8. Produção com readiness mockada percorrendo o builder correto, sem chamada externa.
9. Cancelamento mockado alterando status para `cancelled`.
10. Inutilização mockada registrando série e faixa.
11. Checklist Go-Live com checks fiscais esperados.
12. Respostas públicas sem token, CSC, certificado, senha ou payload sensível completo.

## O que NÃO valida

Este smoke test não substitui homologação real e não garante autorização pela SEFAZ. Ele não valida:

- Emissão de nota real.
- Comunicação real com a Focus NFe.
- Comunicação com a SEFAZ.
- Credenciais reais da Focus.
- Certificado digital real.
- CSC real.
- Regras fiscais da loja validadas por contador.
- Autorização, rejeição ou contingência real retornada por órgão fiscal.

## Garantias de isolamento

A suíte é mockada e local:

- Não emite nota real.
- Não chama SEFAZ.
- Não chama Focus real.
- Não exige token real.
- Não exige certificado real.
- Não exige CSC real.
- Não expõe secrets.

## Próximos passos antes de emissão real

Após o smoke test passar, ainda é obrigatório configurar e validar com dados reais de homologação/produção:

- Token Focus de homologação.
- Certificado digital A1.
- CSC/token NFC-e.
- Dados fiscais completos da loja.
- Validação do contador sobre configurações fiscais, CFOP, NCM, CST/CSOSN, PIS/COFINS e operação.

Somente depois dessas etapas a emissão real contra Focus/SEFAZ deve ser executada em ambiente controlado.
