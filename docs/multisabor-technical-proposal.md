# Proposta técnica: motor genérico de Multisabor

## 1. Contexto e objetivo

A implementação atual de pizza multissabor existe como uma especialização de pizzas, com tabelas, rotas e telas nomeadas como `pizza_*`. A proposta é evoluir para um motor genérico chamado **Multisabor**, capaz de modelar pizzas, açaí, combos, marmitas e outros produtos montáveis por etapas, sem quebrar o fluxo atual de produtos simples, variações e adicionais.

Objetivos principais:

- Permitir que a loja cadastre grupos montáveis por etapas, por exemplo `Pizza Multisabor`.
- Permitir tamanhos com limite de sabores diferente, por exemplo Broto 1, Grande 2 e Família 3.
- Permitir nomes personalizáveis para as etapas `Quantidade de sabores` e `Sabores`.
- Calcular o preço padrão pelo maior preço/classificação entre os sabores selecionados.
- Persistir snapshot completo no pedido para cozinha, caixa, auditoria e emissão fiscal.
- Manter o carrinho aceitando itens simples e itens Multisabor no mesmo pedido.

## 2. Estado atual reaproveitável

### 2.1 Cardápio

O cadastro atual já tem categorias e produtos simples, incluindo preço, disponibilidade, estoque, imagem, unidade e categoria. Essas tabelas devem continuar como base para sabores e itens simples.

Tabelas existentes reaproveitáveis:

- `categories`: agrupamento do cardápio.
- `products`: produtos simples e também candidatos a sabores.
- `product_variants`: variações atuais de produtos simples.
- `addon_groups`, `addon_options`, `product_addon_groups`: adicionais atuais.

### 2.2 Pizza multissabor atual

A base atual possui tabelas específicas de pizza:

- `pizza_sizes`
- `pizza_price_tiers`
- `pizza_size_tier_prices`
- `pizza_flavors`

Essas tabelas representam praticamente o domínio inicial do motor, mas com acoplamento semântico a pizza. A proposta é criar tabelas genéricas novas e migrar/compatibilizar os dados atuais, em vez de ampliar indefinidamente o prefixo `pizza_*`.

### 2.3 Pedido e snapshot parcial atual

O pedido já possui:

- `order_items.item_type`, `display_name`, `pizza_size_id`, `pizza_size_name`, `pricing_mode`, `base_pizza_tier_id`, `base_pizza_tier_name`.
- `order_item_flavors` com snapshots de nome do sabor, classificação e fração.
- `order_item_addons` com snapshots de adicionais.

Isso comprova que o caminho correto é manter snapshots no pedido, porém tornar os campos genéricos para Multisabor.

## 3. Tabelas necessárias

### 3.1 `multisabor_groups`

Representa um produto montável, como `Pizza Multisabor`, `Açaí Montável`, `Combo Família` ou `Marmita Montável`.

Campos propostos:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | serial | PK |
| `store_id` | integer | FK lojas |
| `category_id` | integer nullable | Categoria onde o grupo aparece no cardápio |
| `name` | text | Nome do grupo exibido no wizard |
| `description` | text nullable | Descrição comercial |
| `quantity_step_label` | text | Default `Quantidade de sabores` |
| `flavors_step_label` | text | Default `Sabores` |
| `pricing_mode` | text | Default `highest_classification`; futuro: soma, média, preço fixo |
| `active` | boolean | Ativo/inativo |
| `available` | boolean | Disponível para venda |
| `sort_order` | integer | Ordenação |
| `created_at` | timestamptz | Auditoria |
| `updated_at` | timestamptz | Auditoria |

Índices:

- `(store_id)`
- `(store_id, category_id)`

### 3.2 `multisabor_sizes`

Representa tamanhos ou bases do grupo, por exemplo Broto, Grande, Família, 300ml, 500ml, Marmita P/M/G.

Campos propostos:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | serial | PK |
| `store_id` | integer | FK lojas |
| `group_id` | integer | FK `multisabor_groups` |
| `name` | text | Nome do tamanho |
| `min_flavors` | integer | Default 1 |
| `max_flavors` | integer | Define limite por tamanho |
| `fraction_denominator` | integer nullable | Opcional; default igual à quantidade escolhida |
| `active` | boolean | Ativo/inativo |
| `available` | boolean | Disponível para venda |
| `sort_order` | integer | Ordenação |
| `created_at` | timestamptz | Auditoria |
| `updated_at` | timestamptz | Auditoria |

Índices/constraints:

- `(store_id, group_id)`
- `check (min_flavors >= 1)`
- `check (max_flavors >= min_flavors)`

### 3.3 `multisabor_classifications`

Substitui `pizza_price_tiers`. Para pizza pode ser Tradicional, Especial, Premium; para outros segmentos pode representar faixa de preço ou categoria comercial.

Campos propostos:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | serial | PK |
| `store_id` | integer | FK lojas |
| `group_id` | integer | FK `multisabor_groups` |
| `name` | text | Nome da classificação |
| `rank` | integer | Ordem de preço; maior rank tende a ganhar em empate técnico |
| `active` | boolean | Ativo/inativo |
| `sort_order` | integer | Ordenação visual |
| `created_at` | timestamptz | Auditoria |
| `updated_at` | timestamptz | Auditoria |

Índices/constraints:

- `(store_id, group_id)`
- `unique (store_id, group_id, name)`

### 3.4 `multisabor_size_classification_prices`

Matriz de preço por tamanho e classificação.

Campos propostos:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | serial | PK |
| `store_id` | integer | FK lojas |
| `group_id` | integer | Denormalização controlada para queries/tenant guard |
| `size_id` | integer | FK `multisabor_sizes` |
| `classification_id` | integer | FK `multisabor_classifications` |
| `price` | numeric(10,2) | Preço base para aquele tamanho/classificação |
| `created_at` | timestamptz | Auditoria |
| `updated_at` | timestamptz | Auditoria |

Índices/constraints:

- `unique (store_id, size_id, classification_id)`
- `(store_id, group_id)`

### 3.5 `multisabor_flavors`

Vincula produtos existentes como sabores/opções de montagem em um grupo.

Campos propostos:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | serial | PK |
| `store_id` | integer | FK lojas |
| `group_id` | integer | FK `multisabor_groups` |
| `product_id` | integer | FK `products`; o produto é o sabor |
| `classification_id` | integer | FK `multisabor_classifications` |
| `active` | boolean | Ativo/inativo |
| `available` | boolean | Disponível para venda |
| `sort_order` | integer | Ordenação |
| `created_at` | timestamptz | Auditoria |
| `updated_at` | timestamptz | Auditoria |

Índices/constraints:

- `unique (store_id, group_id, product_id)`
- `(store_id, group_id, classification_id)`

### 3.6 Associação de adicionais ao grupo/tamanho

Opção mínima:

- Reaproveitar `product_addon_groups` criando um **produto técnico** por grupo Multisabor.

Opção recomendada para clareza:

Criar `multisabor_addon_groups`:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | serial | PK |
| `store_id` | integer | FK lojas |
| `group_id` | integer | FK `multisabor_groups` |
| `size_id` | integer nullable | Restrição opcional por tamanho |
| `addon_group_id` | integer | FK `addon_groups` |
| `sort_order` | integer | Ordem da etapa de adicionais |

Constraint:

- `unique (store_id, group_id, size_id, addon_group_id)`

### 3.7 Snapshot genérico no pedido

#### Alterações em `order_items`

Adicionar campos genéricos e manter campos antigos de pizza temporariamente para compatibilidade:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `multisabor_group_id` | integer nullable | FK `multisabor_groups` |
| `multisabor_group_name` | text nullable | Snapshot |
| `multisabor_size_id` | integer nullable | FK `multisabor_sizes` |
| `multisabor_size_name` | text nullable | Snapshot |
| `multisabor_quantity_step_label` | text nullable | Snapshot do label |
| `multisabor_flavors_step_label` | text nullable | Snapshot do label |
| `multisabor_pricing_mode` | text nullable | Snapshot da regra usada |
| `multisabor_base_classification_id` | integer nullable | Classificação vencedora |
| `multisabor_base_classification_name` | text nullable | Snapshot |
| `configuration_snapshot` | jsonb nullable | Snapshot completo, versionado |

Uso recomendado:

- `item_type = 'multisabor'` para itens montados.
- `display_name` com resumo amigável, por exemplo `Pizza Multisabor Grande - 1/2 Calabresa, 1/2 Portuguesa`.
- `unit_price` = preço base calculado + adicionais por unidade.
- `total_price` = `unit_price * quantity`.

#### Nova tabela `order_item_multisabor_selections`

Substitui genericamente `order_item_flavors`.

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | serial | PK |
| `order_item_id` | integer | FK `order_items` com cascade |
| `flavor_id` | integer nullable | FK `multisabor_flavors`; nullable para snapshot histórico |
| `product_id` | integer nullable | FK `products` |
| `product_name_snapshot` | text | Nome do sabor na venda |
| `classification_id` | integer nullable | FK `multisabor_classifications` |
| `classification_name_snapshot` | text | Nome da classificação na venda |
| `classification_rank_snapshot` | integer nullable | Rank na venda |
| `classification_price_snapshot` | numeric(10,2) | Preço da matriz usado para comparação |
| `fraction_numerator` | integer | Ex.: 1 |
| `fraction_denominator` | integer | Ex.: 2, 3 |
| `sort_order` | integer | Ordem de exibição |
| `notes` | text nullable | Observação específica do sabor, se necessário no futuro |

Índice:

- `(order_item_id)`

## 4. Como reaproveitar tabelas existentes

1. **Categorias**: `categories` continuam organizando o cardápio. `multisabor_groups.category_id` permite exibir grupos no cardápio sem criar produtos falsos obrigatórios.
2. **Produtos simples**: `products` continuam sendo vendidos diretamente e também podem ser vinculados como sabores via `multisabor_flavors.product_id`.
3. **Variações atuais**: `product_variants` não deve ser alterada para Multisabor. Variações continuam para produtos simples; tamanhos Multisabor ficam em `multisabor_sizes`.
4. **Adicionais atuais**: `addon_groups`, `addon_options` e `order_item_addons` são reaproveitados. A única dúvida é a associação: usar produto técnico via `product_addon_groups` ou criar `multisabor_addon_groups`.
5. **Pedido**: `orders`, `order_items` e `order_item_addons` continuam como base. A mudança é adicionar metadados genéricos e criar seleção genérica de sabores.
6. **Pizza atual**: dados de `pizza_*` podem ser migrados para `multisabor_*` com um grupo inicial `Pizza Multisabor`; rotas antigas podem virar aliases temporários.

## 5. Alterações mínimas no schema

### Fase mínima segura

1. Criar tabelas `multisabor_groups`, `multisabor_sizes`, `multisabor_classifications`, `multisabor_size_classification_prices`, `multisabor_flavors` e `multisabor_addon_groups`.
2. Adicionar em `order_items` apenas os campos genéricos necessários e `configuration_snapshot jsonb`.
3. Criar `order_item_multisabor_selections`.
4. Não remover `pizza_*` nem campos `pizza_*` em `order_items` no primeiro ciclo.
5. Manter `order_item_flavors` para leitura de pedidos antigos, fiscal e cozinha durante a transição.

### Compatibilidade

- Pedidos antigos continuam lendo `order_item_flavors`.
- Pedidos novos usam `order_item_multisabor_selections`.
- Durante uma janela de migração, cozinha/caixa devem tentar ler seleções genéricas e cair para sabores antigos caso não existam.
- Remoção de tabelas/rotas `pizza_*` só deve ocorrer depois de migração e validação de produção.

## 6. APIs necessárias

### 6.1 Administração de cardápio

- `GET /api/menu/multisabor/groups`
- `POST /api/menu/multisabor/groups`
- `PATCH /api/menu/multisabor/groups/:groupId`
- `DELETE /api/menu/multisabor/groups/:groupId` ou soft delete
- `GET /api/menu/multisabor/groups/:groupId/config`
- `POST /api/menu/multisabor/groups/:groupId/sizes`
- `PATCH /api/menu/multisabor/sizes/:sizeId`
- `POST /api/menu/multisabor/groups/:groupId/classifications`
- `PATCH /api/menu/multisabor/classifications/:classificationId`
- `PUT /api/menu/multisabor/groups/:groupId/prices`
- `POST /api/menu/multisabor/groups/:groupId/flavors`
- `PATCH /api/menu/multisabor/flavors/:flavorId`
- `POST /api/menu/multisabor/groups/:groupId/addon-groups`
- `DELETE /api/menu/multisabor/groups/:groupId/addon-groups/:linkId`

### 6.2 Venda/wizard

- `GET /api/menu/multisabor/catalog`
  - Retorna apenas grupos, tamanhos, classificações, preços, sabores e adicionais ativos/disponíveis.
- `POST /api/orders/:orderId/items/multisabor/quote`
  - Valida seleção e retorna preço, classificação vencedora, frações e resumo.
- `POST /api/orders/:orderId/items/multisabor`
  - Adiciona item ao pedido com snapshot completo.
- `PATCH /api/orders/:orderId/items/:itemId/multisabor`
  - Opcional para edição futura.

### 6.3 Importação por planilha

- `POST /api/menu/imports/multisabor/preview`
  - Recebe planilha, valida abas e retorna diff/erros sem gravar.
- `POST /api/menu/imports/multisabor/apply`
  - Aplica importação validada com idempotência por nome/código.
- `GET /api/menu/imports/multisabor/template`
  - Baixa modelo `.xlsx`.

## 7. Componentes de frontend necessários

### 7.1 Cardápio/admin

- `MultisaborGroupList`: lista e status dos grupos.
- `MultisaborGroupForm`: nome, categoria, labels renomeáveis, regra de preço.
- `MultisaborSizeEditor`: tamanhos, mínimo/máximo de sabores e disponibilidade.
- `MultisaborClassificationEditor`: classificações/faixas de preço.
- `MultisaborPriceMatrix`: matriz tamanho x classificação.
- `MultisaborFlavorBinder`: vínculo de produtos como sabores.
- `MultisaborAddonBinder`: vínculo de grupos de adicionais ao grupo/tamanho.
- `MultisaborImportWizard`: upload, validação, prévia e aplicação da planilha.

### 7.2 Pedido

- `AddItemWizard`: entrada unificada para item simples ou Multisabor.
- `MultisaborGroupStep`: seleção do grupo.
- `MultisaborSizeStep`: seleção do tamanho.
- `MultisaborFlavorQuantityStep`: usa label configurável e limita pela regra do tamanho.
- `MultisaborFlavorSelectionStep`: usa label configurável, mostra sabores e classificações.
- `MultisaborAddonStep`: reaproveita UI de adicionais.
- `MultisaborSummaryStep`: mostra tamanho, sabores/frações, classificação vencedora, adicionais, observações e total.
- `CartItemMultisaborSummary`: renderização compacta no carrinho.

### 7.3 Cozinha, caixa e detalhes

- `KitchenMultisaborItemDetails`: tamanho, sabores, frações, adicionais e observações.
- `PaymentMultisaborSummary`: resumo e total correto no caixa.
- `OrderDetailMultisaborSnapshot`: leitura histórica do snapshot.

## 8. Importador por planilha

Abas propostas:

1. **Categorias**
   - `nome`, `descricao`, `ordem`
2. **Produtos Simples**
   - `categoria`, `nome`, `descricao`, `preco`, `sku`, `disponivel`, `ativo`, `unidade`
3. **Multisabor Grupos**
   - `nome`, `categoria`, `descricao`, `label_quantidade`, `label_sabores`, `regra_preco`, `disponivel`, `ativo`, `ordem`
4. **Multisabor Tamanhos**
   - `grupo`, `tamanho`, `min_sabores`, `max_sabores`, `disponivel`, `ativo`, `ordem`
5. **Multisabor Classificações**
   - `grupo`, `classificacao`, `rank`, `ativo`, `ordem`
6. **Multisabor Preços**
   - `grupo`, `tamanho`, `classificacao`, `preco`
7. **Multisabor Sabores**
   - `grupo`, `produto`, `classificacao`, `disponivel`, `ativo`, `ordem`
8. **Adicionais**
   - `grupo_adicional`, `opcao`, `preco`, `obrigatorio`, `min`, `max`, `produto_ou_multisabor`, `tamanho_opcional`, `disponivel`, `ordem`

Validações essenciais:

- Todos os nomes referenciados devem existir na própria planilha ou no banco.
- Preço deve ser numérico e não negativo.
- `max_sabores >= min_sabores`.
- Todo sabor precisa ter preço para o tamanho selecionável via sua classificação.
- Importação deve ter prévia com erros por aba/linha.
- Aplicação deve rodar em transação.

## 9. Regra de preço padrão

Para `pricing_mode = highest_classification`:

1. O usuário seleciona grupo e tamanho.
2. O sistema limita a quantidade pela configuração do tamanho.
3. Para cada sabor selecionado, busca a classificação do sabor.
4. Para cada classificação, busca preço em `multisabor_size_classification_prices` para o tamanho.
5. O preço base do item é o maior preço encontrado.
6. A classificação vencedora é salva em snapshot.
7. Adicionais são somados ao preço base conforme regras atuais.
8. O preço final do item é `(preço base + adicionais) * quantidade`.

Observação: frações não reduzem preço no modo padrão; elas descrevem a composição para produção e conferência.

## 10. Riscos

### 10.1 Pedidos

- Risco de quebrar itens simples se o fluxo de adicionar item for substituído de uma vez.
- Risco de total divergente se quote frontend e cálculo backend divergirem.
- Risco de edição/cancelamento de item não limpar seleções e adicionais corretamente.

Mitigações:

- Backend deve ser a fonte final do cálculo.
- Carrinho deve manter caminhos separados para `normal` e `multisabor`.
- Testes de regressão para produto simples, variação, adicional e Multisabor no mesmo pedido.

### 10.2 Cozinha

- Risco de ticket não exibir frações ou observações específicas.
- Risco de pedidos antigos com `order_item_flavors` sumirem se a UI ler apenas tabela nova.

Mitigações:

- Camada de leitura deve normalizar `multisaborSelections || legacyFlavors`.
- Ticket deve priorizar snapshot, não cadastro atual.

### 10.3 Caixa

- Risco de resumo confuso ou total incorreto quando há adicionais.
- Risco fiscal se descrição do item não contemplar sabores.

Mitigações:

- `display_name` e `configuration_snapshot` devem carregar resumo congelado.
- Tela de pagamento deve mostrar base, adicionais e total.
- Payload fiscal deve usar descrição fiscal consolidada do snapshot.

### 10.4 Cardápio

- Risco de duplicar cadastro de pizza entre `pizza_*` e `multisabor_*`.
- Risco de sabores sem preço para determinado tamanho.
- Risco de importação sobrescrever dados indevidamente.

Mitigações:

- Migração cria grupo Multisabor a partir do legado e marca rotas antigas como compatibilidade.
- Validação impede publicar grupo incompleto.
- Importador deve ter preview e aplicar em transação.

## 11. Plano de PRs pequenos

1. **PR 1 — Proposta e contrato técnico**
   - Adicionar esta documentação.
   - Definir nomenclatura, entidades, snapshots e critérios.

2. **PR 2 — Schema Multisabor sem uso em produção**
   - Criar tabelas `multisabor_*`.
   - Adicionar campos genéricos em `order_items` e seleção genérica.
   - Sem alterar fluxo de venda.

3. **PR 3 — APIs admin e seeds/migração de pizza**
   - CRUD de grupos, tamanhos, classificações, preços e sabores.
   - Script de migração `pizza_*` -> `multisabor_*`.
   - Rotas antigas como aliases, se necessário.

4. **PR 4 — Importador com preview**
   - Template da planilha.
   - Preview com validação por aba/linha.
   - Apply transacional.

5. **PR 5 — Wizard de venda e quote backend**
   - Catálogo Multisabor para venda.
   - Quote backend autoritativo.
   - Adicionar item Multisabor ao pedido.

6. **PR 6 — Carrinho, detalhes, cozinha e caixa**
   - Renderização de snapshots genéricos.
   - Compatibilidade com pedidos antigos.
   - Testes de total e resumo.

7. **PR 7 — Fiscal, auditoria e hardening**
   - Ajustar descrição fiscal para Multisabor.
   - Cobrir regressões de NFC-e/pagamento.
   - Logs/auditoria de importação e alterações críticas.

8. **PR 8 — Depreciação controlada do legado pizza**
   - Remover dependências diretas novas de `pizza_*`.
   - Manter leitura histórica pelo tempo necessário.
   - Documentar migração final.

## 12. Critérios de aceite

### Configuração

- Loja consegue cadastrar grupo `Pizza Multisabor`.
- Loja consegue cadastrar tamanhos com limites distintos: Broto 1, Grande 2, Família 3.
- Loja consegue renomear as etapas `Quantidade de sabores` e `Sabores`.
- Loja consegue cadastrar classificações e matriz de preços por tamanho.
- Loja consegue vincular produtos existentes como sabores.
- Loja consegue vincular adicionais existentes ao grupo/tamanho.
- Importador aceita as abas propostas e valida inconsistências antes de gravar.

### Pedido

- Usuário cria Novo Pedido, informa tipo e cliente/mesa/delivery, e adiciona item por wizard.
- Wizard permite selecionar grupo, tamanho, quantidade de sabores, sabores, adicionais e resumo.
- Broto bloqueia mais de 1 sabor quando configurado com `max_flavors = 1`.
- Grande permite até 2 sabores quando configurado com `max_flavors = 2`.
- Família permite até 3 sabores quando configurado com `max_flavors = 3`.
- Preço base usa a maior classificação/preço entre os sabores selecionados.
- Carrinho aceita item simples e item Multisabor no mesmo pedido.
- Backend recalcula/valida preço e não confia apenas no frontend.

### Snapshot e operação

- Pedido salva snapshot completo de grupo, tamanho, labels, regra de preço, classificação vencedora, sabores, frações, adicionais e observações.
- Cozinha exibe tamanho, sabores, frações, adicionais e observações.
- Caixa exibe resumo e total correto.
- Produtos simples, variações atuais e adicionais atuais continuam funcionando.
- Pedidos antigos de pizza multissabor continuam visíveis durante a transição.
