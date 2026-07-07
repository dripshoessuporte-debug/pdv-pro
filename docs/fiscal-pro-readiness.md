# Fiscal PRO — checklist de prontidão

Este checklist é uma visão operacional para decidir se uma loja PRO está pronta para avançar nos testes fiscais em homologação antes de qualquer implantação com cliente real.

## Antes de ativar cliente real

Antes da implantação assistida, a loja deve ter:

1. Plano PRO ativo com módulo fiscal liberado para Max Control.
2. Configuração fiscal da loja criada.
3. CNPJ e inscrição estadual preenchidos.
4. Série e próxima numeração da NFC-e configuradas.
5. Empresa vinculada à Focus NFe.
6. Token Focus de homologação salvo.
7. Certificado digital A1 enviado e dentro da validade.
8. CSC/token da NFC-e configurado para homologação.
9. Pelo menos uma NFC-e de homologação autorizada, quando houver fluxo disponível.
10. Último documento fiscal sem rejeição/erro crítico pendente.

## O que o checklist valida

O endpoint seguro `GET /api/fiscal/focus/readiness` consolida somente metadados seguros da loja atual do ator autenticado. Ele não aceita `storeId` vindo do frontend comum e mantém a mesma barreira de acesso do módulo fiscal: usuário Max Control e plano PRO/fiscal ativo.

Checks retornados:

- `PLAN_PRO_ACTIVE`: confirma acesso fiscal pelo plano PRO.
- `FISCAL_CONFIG_EXISTS`: verifica se existe configuração fiscal da loja.
- `CNPJ_CONFIGURED`: verifica CNPJ preenchido.
- `STATE_REGISTRATION_CONFIGURED`: verifica inscrição estadual preenchida.
- `FOCUS_TOKEN_CONFIGURED`: verifica token Focus de homologação salvo, sem retornar o token.
- `FOCUS_COMPANY_LINKED`: verifica empresa vinculada à Focus.
- `CERTIFICATE_CONFIGURED`: verifica certificado enviado, sem retornar arquivo, senha ou referência sensível.
- `CERTIFICATE_NOT_EXPIRED`: verifica vencimento conhecido do certificado e alerta quando faltar menos de 30 dias.
- `CSC_CONFIGURED`: verifica CSC/token configurado, sem retornar CSC nem segredo.
- `HOMOLOGATION_TEST_DONE`: verifica se já existe documento de homologação autorizado.
- `LAST_DOCUMENT_NOT_REJECTED`: alerta quando o último documento fiscal estiver rejeitado ou com erro.
- `PRODUCTION_TOKEN_CONFIGURED`: verifica token Focus de produção salvo, sem retornar o token.
- `PRODUCTION_ADMIN_RELEASE`: exige liberação administrativa explícita antes de qualquer emissão real.

`readyForHomologation` só deve ficar verdadeiro quando os itens básicos de plano, configuração fiscal, Focus, certificado e CSC estiverem OK ou apenas com aviso não bloqueante. `readyForProduction` só fica `true` quando, além disso, houver token Focus de produção, certificado válido, CSC configurado, ao menos uma NFC-e de homologação autorizada, nenhum bloqueio crítico e liberação administrativa explícita (`setupStatus = production`). Sem essa liberação, a API mantém `readyForProduction = false` e informa: "Produção depende de liberação administrativa em etapa futura."

## Segurança

O checklist nunca retorna:

- token Focus;
- certificado digital;
- senha do certificado;
- CSC/token CSC;
- payload fiscal sensível;
- stack trace de erro.

As respostas usam booleanos, datas de validade, status e identificadores públicos já utilizados pela integração fiscal.

## Ainda NÃO liberado

Este PR não libera nem implementa:

- liberação automática de emissão NFC-e em produção;
- cancelamento de NFC-e;
- inutilização;
- tratamento fiscal de taxa de entrega;
- Fiscal para Multisabor;
- mudanças em regras fiscais dos produtos;
- mudanças em pedido, caixa, pagamento, cozinha ou integrações iFood/99.

## Próximas etapas recomendadas

1. Finalizar validação assistida de homologação por loja.
2. Definir processo operacional para revisar rejeições do último documento.
3. Operacionalizar a liberação administrativa controlada de produção por loja.
4. Implementar cancelamento e inutilização em PRs separados.
5. Planejar regras fiscais específicas para taxa de entrega e Multisabor sem misturar com a liberação de produção.
