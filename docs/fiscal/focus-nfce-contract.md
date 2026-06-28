# Auditoria do contrato Focus NFC-e

## Fontes oficiais usadas

- `https://doc.focusnfe.com.br/llms.txt`
- `https://doc.focusnfe.com.br/reference/emitir_nfce`
- `https://doc.focusnfe.com.br/reference/consultar_nfce`
- `https://doc.focusnfe.com.br/reference/cancelar_nfce`
- `https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html`, indicada pela página oficial de emissão NFC-e como referência completa de campos NFe/NFC-e 4.00.
- Postman oficial Focus NFe (`https://www.postman.com/focusnfe/focus-nfe/documentation/906jrtc/focus-nfe`) apenas como conferência de workspace oficial; a implementação usa os endpoints da documentação/OpenAPI do site Focus.

## Endpoint oficial usado

- Criação: `POST /v2/nfce?ref={referencia}`. O parâmetro `ref` é obrigatório e representa a referência única da NFC-e no sistema integrador.
- Consulta: `GET /v2/nfce/{referencia}`.
- Cancelamento: `DELETE /v2/nfce/{referencia}` com `justificativa` entre 15 e 255 caracteres. O cancelamento está documentado, mas não implementado neste PR.

Mantemos referências locais em até 60 caracteres e somente com letras, números, ponto, underscore, dois-pontos e hífen, por compatibilidade segura com o contrato.

## Autenticação e ambiente

A Focus usa Basic Auth com o token Focus como usuário e senha vazia. Em homologação o base URL do cliente é `https://homologacao.focusnfe.com.br`; produção continua fora de escopo.

## Campos obrigatórios confirmados para o payload atual

Campos gerais usados: `cnpj_emitente`, `natureza_operacao`, `data_emissao`, `tipo_documento`, `finalidade_emissao`, `consumidor_final`, `presenca_comprador`, `modalidade_frete`, `items` e `formas_pagamento`.

Itens usam `items` (não `produtos` nem `itens`) e os nomes auditados: `ncm`, `unidade_comercial`, `quantidade_comercial`, `valor_unitario_comercial`, `valor_bruto`, `unidade_tributavel`, `quantidade_tributavel`, `valor_unitario_tributavel`, `inclui_no_total`, `icms_origem`, `icms_situacao_tributaria`, `pis_situacao_tributaria` e `cofins_situacao_tributaria`.

Pagamentos usam `formas_pagamento`, `forma_pagamento`, `valor_pagamento` e `valor_troco` quando houver troco.

## Campos opcionais

A documentação informa que `serie` e `numero` podem ficar em branco para a API controlar automaticamente. O Gestor Max mantém reserva transacional e envia `serie`/`numero` porque a tela fiscal já coleta a próxima numeração e porque esse controle evita lacunas locais antes do botão visual. Dados cadastrais do emitente como razão social, fantasia, endereço, município, UF, CEP, telefone e CRT podem ser inferidos do cadastro da empresa na Focus quando omitidos; `cnpj_emitente` e `inscricao_estadual_emitente` são tratados como obrigatórios no contrato de campos.

## Bloqueios atuais do Gestor Max

- `ifood_online` e `platform` seguem bloqueados até mapeamento fiscal real de intermediador/pagamento.
- Taxa de entrega segue bloqueada até regra fiscal específica de frete/serviço/produto de entrega.
- CPF do consumidor, emissão em produção, cancelamento, inutilização, impressão, WhatsApp, e-mail e emissão automática pós-pagamento estão fora do escopo.
- Se `cnpj` ou `stateRegistration` da loja estiverem ausentes, a emissão falha com `FISCAL_SETUP_NOT_READY` e `issuer_data_incomplete` antes de chamar a Focus.

## Status oficiais e normalização

A NFC-e é síncrona: o `POST` retorna autorização ou rejeição na mesma requisição. O sucesso local `authorized` exige `status = "autorizado"`, `status_sefaz = "100"`, chave de acesso, protocolo e XML ou DANFCe disponível. Rejeições oficiais como `erro_autorizacao`, `denegado` e `rejeitado` viram `rejected`; respostas ambíguas permanecem `processing`/`sync_pending` conforme o ponto do fluxo.

## XML e DANFCe

A consulta/emissão retorna caminhos como `caminho_xml_nota_fiscal` e `caminho_danfe`/`caminho_danfce`. O backend mapeia para `xmlUrl`, `danfceUrl`, `xmlAvailable` e `danfceAvailable`. Se a Focus retornar caminho relativo, uma etapa futura deverá montar download autenticado no backend, sem expor token em URL pública.

## Erros oficiais relevantes

A documentação lista erros de referência, forma de emissão, permissão, referência em processamento/já usada, campos obrigatórios, ambiente não configurado, empresa não configurada e CSC não configurado. O backend mantém falha segura sem retry automático de `POST`.

## Onboarding e checklist antes da primeira nota

1. Vincular empresa Focus da loja.
2. Configurar token de homologação.
3. Enviar certificado A1.
4. Configurar CSC homologação.
5. Preencher CNPJ, IE, UF e código IBGE da loja.
6. Configurar série/próximo número enquanto usarmos numeração manual.
7. Preencher regras fiscais de produtos ou grupos.
8. Garantir pedido pago por meio suportado e sem taxa de entrega não mapeada.

## Script manual opcional

`artifacts/api-server/scripts/focus-nfce-contract-smoke.mjs` é um smoke manual para quando houver empresa real de homologação cadastrada. Ele só roda com `FOCUS_NFE_SMOKE_ENABLED=true`, `FOCUS_NFE_SMOKE_TOKEN` e `FOCUS_NFE_SMOKE_REF`; não é chamado no CI nem nos testes e não imprime token.
