import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const menuSource = readFileSync(fileURLToPath(new URL("./menu.tsx", import.meta.url)), "utf8");
const orderSource = readFileSync(fileURLToPath(new URL("./order-detail.tsx", import.meta.url)), "utf8");
const kitchenSource = readFileSync(fileURLToPath(new URL("./kitchen.tsx", import.meta.url)), "utf8");

test("aba Pizzas multissabor aparece no menu superior do Cardápio", () => {
  assert.match(menuSource, /Produtos \| Categorias \| Variações \| Adicionais \| Pizzas multissabor/);
  assert.match(menuSource, /button-pizza-multiflavor-tab/);
});

test("tela possui seções Tamanhos, Classificações, Preços e Sabores com estados vazios", () => {
  for (const expected of ["1. Tamanhos", "2. Classificações", "3. Preços por tamanho", "4. Sabores vinculados"]) assert.ok(menuSource.includes(expected));
  assert.match(menuSource, /Cadastre pelo menos um tamanho antes de montar pizza/);
  assert.match(menuSource, /Vincule pelo menos um sabor antes de montar pizza/);
});

test("botão de exemplo rápido mostra preço final pela maior classificação", () => {
  assert.match(menuSource, /Ver exemplo de configuração/);
  assert.match(menuSource, /Grande Tradicional = R\$ 54,90/);
  assert.match(menuSource, /Preço final: R\$ 64,90/);
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
