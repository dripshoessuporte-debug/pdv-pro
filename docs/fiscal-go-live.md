# Go-Live Fiscal NFC-e

Este documento orienta a homologação controlada e a preparação de cliente real do módulo NFC-e sem expor secrets e sem liberar produção automaticamente.

## 1. Passo a passo para homologação controlada

1. Entrar no Admin/Fiscal com usuário `max_control` da loja correta.
2. Confirmar que a feature fiscal está ativa para a loja.
3. Conferir a configuração fiscal da empresa: CNPJ, IE, endereço, série e próxima numeração.
4. Vincular a empresa Focus NFe e salvar credenciais no backend.
5. Enviar certificado A1 e configurar CSC de homologação.
6. Atualizar o bloco **Go-Live Fiscal** e confirmar os checks.
7. Emitir NFC-e em homologação pelos fluxos já existentes.
8. Confirmar que existe ao menos uma NFC-e homologada autorizada.
9. Executar cancelamento e inutilização em homologação quando aplicável.
10. Validar o resultado com contador e cliente antes de qualquer etapa de produção.

## 2. O que testar antes de cliente real

- Pedido simples com produto comum.
- Pedido Multisabor, confirmando descrição fiscal e referência de sabor válida.
- Pedido com taxa de entrega como item fiscal separado.
- Pedido com pagamento externo/marketplace mapeado como forma fiscal segura.
- Cancelamento de NFC-e autorizada em homologação.
- Inutilização de faixa de numeração em homologação.

## 3. O que conferir no Neon/Railway sem expor secrets

- Conferir existência de configuração fiscal da loja e status dos documentos fiscais.
- Conferir se há credenciais por tipo/ambiente apenas por presença de registro, nunca copiando valores criptografados.
- Conferir logs por códigos seguros, sem imprimir tokens, CSC, certificado, senha ou payload fiscal completo.
- Validar que consultas e diagnósticos usam a loja autenticada (`actor.storeId`).

## 4. O que validar com contador/cliente

- Dados cadastrais da empresa emissora.
- Regime tributário, CFOP, NCM, CSOSN/CST, PIS e COFINS.
- CSC/ID CSC corretos para o ambiente.
- Série e numeração inicial.
- DANFCE/XML gerados em homologação.
- Procedimento operacional para cancelamento e inutilização.

## 5. Checklist de segurança

- Produção permanece bloqueada quando a prontidão não está completa.
- Tokens Focus não aparecem no frontend ou em respostas de diagnóstico.
- CSC, certificado A1 e senha não aparecem no frontend ou em respostas de diagnóstico.
- O `storeId` é isolado pelo backend a partir do usuário autenticado.
- O checklist Go-Live é diagnóstico: não emite NFC-e real, não cancela e não inutiliza automaticamente.

## 6. Próximos passos depois do Go-Live

1. Planejar janela assistida com cliente e contador.
2. Revisar variáveis de produção no ambiente seguro.
3. Liberar produção apenas após confirmação explícita da prontidão.
4. Emitir primeira NFC-e real acompanhada.
5. Monitorar rejeições, XML/DANFCE e numeração nas primeiras vendas.
6. Registrar evidências de aceite do cliente/contador.
