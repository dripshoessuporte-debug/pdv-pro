import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const menuSource = readFileSync(fileURLToPath(new URL("./menu.tsx", import.meta.url)), "utf8");
const orderSource = readFileSync(fileURLToPath(new URL("./order-detail.tsx", import.meta.url)), "utf8");
const kitchenSource = readFileSync(fileURLToPath(new URL("./kitchen.tsx", import.meta.url)), "utf8");

test("aba Multisabor aparece no menu superior do Cardápio", () => {
  assert.match(menuSource, /data-testid="button-new-product"/);
  assert.match(menuSource, /data-testid="button-new-category"/);
  assert.match(menuSource, /Variações gerais/);
  assert.match(menuSource, /data-testid="button-manage-addons"/);
  assert.match(menuSource, /Multisabor/);
  assert.match(menuSource, /button-pizza-multiflavor-tab/);
  assert.match(menuSource, /const \[showPizzaMultiflavorConfig, setShowPizzaMultiflavorConfig\] = useState\(false\)/);
  assert.match(menuSource, /\{showPizzaMultiflavorConfig && <Card id="multisabor-config" data-testid="multisabor-config"/);
  assert.match(menuSource, /\{!showPizzaMultiflavorConfig && \(/);
});

test("tela possui seções Tamanhos, Classificações, Preços e Sabores com estados vazios", () => {
  for (const expected of ["Tamanhos", "Classificações", "Preços por tamanho e classificação", "Sabores"]) assert.ok(menuSource.includes(expected));
  assert.match(menuSource, /Cadastre pelo menos um tamanho antes de informar preços/);
  assert.match(menuSource, /Vincule produtos do cardápio como sabores/);
});

test("tela orienta configuração e preço pela maior classificação", () => {
  assert.match(menuSource, /Ordem recomendada/);
  assert.match(menuSource, /Cadastrar tamanhos/);
  assert.match(menuSource, /Cadastrar classificações/);
  assert.match(menuSource, /Informar preços/);
  assert.match(menuSource, /Maior classificação selecionada/);
  assert.match(menuSource, /A maior prioridade vence no cálculo/);
});

test("montagem bloqueia configuração incompleta antes da API", () => {
  assert.match(orderSource, /Cadastre pelo menos um tamanho antes de montar pizza/);
  assert.match(orderSource, /Cadastre pelo menos um preço por tamanho e classificação antes de montar pizza/);
  assert.match(orderSource, /Escolha pelo menos um sabor para montar a pizza/);
  assert.match(orderSource, /permite no máximo/);
});

test("montagem mostra preço final e tradicional mais nobre cobra nobre", () => {
  assert.match(orderSource, /Preço final calculado: R\$/);
  assert.match(orderSource, /Regra: cobra pela maior classificação/);
  assert.match(orderSource, /reduce\(\(max: any, f: any\) => f\.finalPrice > max\.finalPrice/);
});

test("erros do backend são traduzidos para mensagens amigáveis", () => {
  assert.match(orderSource, /translatePizzaApiError/);
  assert.match(orderSource, /Tamanho de pizza não encontrado ou inativo/);
  assert.match(orderSource, /Falta preço para esse tamanho e classificação/);
});

test("pedido e cozinha mostram sabores da pizza", () => {
  assert.match(orderSource, /flavors\.map/);
  assert.match(kitchenSource, /flavor\.fractionNumerator/);
  assert.match(kitchenSource, /flavor\.productName/);
});

test("item normal e adicionais continuam no fluxo existente", () => {
  assert.match(orderSource, /addProductToExistingOrder/);
  assert.match(orderSource, /addonOptionId/);
});

test("frontend da pizza não envia storeId", () => {
  const pizzaBlocks = [menuSource, orderSource].join("\n");
  assert.doesNotMatch(pizzaBlocks, /storeId\s*:/);
});
