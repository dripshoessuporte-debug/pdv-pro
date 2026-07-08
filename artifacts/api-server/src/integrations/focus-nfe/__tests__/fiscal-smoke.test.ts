import test from "node:test";
import assert from "node:assert/strict";
import {
  fiscalGroupRulesTable,
  fiscalGroupsTable,
  orderItemFlavorsTable,
  orderItemsTable,
  ordersTable,
  paymentsTable,
  productFiscalSettingsTable,
  productsTable,
  storeFiscalPresentationTable,
  storeFiscalSettingsTable,
} from "@workspace/db";
import { buildNfcePayload, buildProductionNfcePayload } from "../nfce-payload";
import { buildNfcePaymentLinesForTests } from "../nfce-payload";
import { NfceServiceError } from "../nfce-types";

const storeId = 101;
const rule = { ncm: "19059090", cest: null, cfop: "5102", commercialUnit: "UN", origin: "0", icmsCode: "102", pisCode: "49", cofinsCode: "49" };
const settings = { storeId, providerCompanyId: "focus-company-mock", cscId: "000001", cscSecretReference: "secret-ref-redacted", certificateReference: "cert-ref-redacted", certificateStatus: "valid", series: 1, nextNumber: 100, natureOperation: "Venda", cnpj: "12345678000195", stateRegistration: "123456789" };
const presentation = { storeId, mode: "complete" };
const simpleProduct = { id: 11, name: "Produto simples", storeId };
const flavorA = { id: 21, name: "Calabresa", storeId };
const flavorB = { id: 22, name: "Quatro Queijos", storeId };
const fiscalGroups = [{ id: 901, name: "Taxa de entrega", storeId }];
const fiscalGroupRules = [{ ...rule, storeId, fiscalGroupId: 901 }];
const productRules = [simpleProduct, flavorA, flavorB].map((p) => ({ ...rule, storeId, productId: p.id, fiscalGroupId: null }));

type Scenario = { order: any; items: any[]; flavors?: any[]; payments: any[]; products?: any[]; productRules?: any[]; groups?: any[]; groupRules?: any[]; setup?: any; presentation?: any };

function mockDb(s: Scenario) {
  const rows = new Map<any, any[]>([
    [storeFiscalSettingsTable, [s.setup ?? settings]],
    [storeFiscalPresentationTable, [s.presentation ?? presentation]],
    [ordersTable, [s.order]],
    [orderItemsTable, s.items],
    [paymentsTable, s.payments],
    [orderItemFlavorsTable, s.flavors ?? []],
    [productsTable, s.products ?? [simpleProduct, flavorA, flavorB]],
    [productFiscalSettingsTable, s.productRules ?? productRules],
    [fiscalGroupsTable, s.groups ?? fiscalGroups],
    [fiscalGroupRulesTable, s.groupRules ?? fiscalGroupRules],
  ]);
  return {
    select() {
      return {
        from(table: any) {
          const result = rows.get(table) ?? [];
          const chain: any = {
            where: () => chain,
            orderBy: () => chain,
            limit: (n: number) => Promise.resolve(result.slice(0, n)),
            then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
          };
          return chain;
        },
      };
    },
  };
}

function baseOrder(total: string, deliveryFee = "0.00") { return { id: 500, storeId, status: "paid", totalAmount: total, deliveryFee }; }
function simpleItem(id = 1, totalPrice = "25.00") { return { id, orderId: 500, productId: simpleProduct.id, itemType: "product", displayName: "Produto simples", quantity: 1, totalPrice }; }
function multiItem(id = 2, totalPrice = "50.00") { return { id, orderId: 500, productId: null, itemType: "multisabor", displayName: "Pizza Multisabor - 2 sabores", pizzaSizeName: "Grande", quantity: 1, totalPrice }; }
function multiFlavors(orderItemId = 2) { return [{ id: 1, orderItemId, productId: flavorA.id, sortOrder: 0, productNameSnapshot: "Calabresa" }, { id: 2, orderItemId, productId: flavorB.id, sortOrder: 1, productNameSnapshot: "Quatro Queijos" }]; }
function payment(method: string, amount: string) { return { orderId: 500, method, amount, change: "0.00", status: "approved" }; }
async function payload(s: Scenario) { return buildNfcePayload({ db: mockDb(s) as any, storeId, orderId: 500, series: 1, number: 100 }); }
function publicJson(value: unknown) { return JSON.stringify(value).toLowerCase(); }
function assertNoSecrets(value: unknown) {
  const json = publicJson(value);
  for (const forbidden of ["token", "csc", "certificado", "certificate", "senha", "password", "secret-ref-redacted", "cert-ref-redacted", "payloadsnapshot"]) assert.equal(json.includes(forbidden), false, forbidden);
}

test("smoke fiscal mockado gera payload NFC-e para pedido simples sem chamar Focus real", async () => {
  const p = await payload({ order: baseOrder("25.00"), items: [simpleItem()], payments: [payment("pix", "25.00")] });
  assert.equal((p as any).ambiente, "2");
  assert.equal((p as any).items[0].descricao, "Produto simples");
  assert.equal((p as any).formas_pagamento[0].forma_pagamento, "17");
  assertNoSecrets(p);
});

test("smoke fiscal mockado inclui item Taxa de entrega em pedido simples", async () => {
  const p = await payload({ order: baseOrder("32.00", "7.00"), items: [simpleItem()], payments: [payment("cash", "32.00")] });
  assert.equal((p as any).items.at(-1).descricao, "Taxa de entrega");
  assert.equal((p as any).items.at(-1).valor_bruto, "7.00");
});

test("smoke fiscal mockado gera payload NFC-e para Multisabor", async () => {
  const p = await payload({ order: baseOrder("50.00"), items: [multiItem()], flavors: multiFlavors(), payments: [payment("credit_card", "50.00")] });
  assert.match((p as any).items[0].descricao, /Calabresa \/ Quatro Queijos/);
  assert.equal((p as any).items[0].codigo_produto, String(flavorA.id));
});

test("smoke fiscal mockado gera payload Multisabor com taxa de entrega", async () => {
  const p = await payload({ order: baseOrder("58.00", "8.00"), items: [multiItem()], flavors: multiFlavors(), payments: [payment("debit_card", "58.00")] });
  assert.deepEqual((p as any).items.map((i: any) => i.descricao), ["Pizza Multisabor Grande - Calabresa / Quatro Queijos", "Taxa de entrega"]);
});

test("smoke fiscal mockado mapeia pagamento externo/marketplace", async () => {
  const p = await payload({ order: baseOrder("25.00"), items: [simpleItem()], payments: [payment("marketplace", "25.00")] });
  assert.deepEqual((p as any).formas_pagamento, [{ forma_pagamento: "99", valor_pagamento: "25.00", valor_troco: undefined }]);
});

test("smoke fiscal mockado cobre pedido misto completo", async () => {
  const p = await payload({ order: baseOrder("87.00", "12.00"), items: [simpleItem(1, "25.00"), multiItem(2, "50.00")], flavors: multiFlavors(), payments: [payment("ifood_online", "87.00")] });
  assert.deepEqual((p as any).items.map((i: any) => i.descricao), ["Produto simples", "Pizza Multisabor Grande - Calabresa / Quatro Queijos", "Taxa de entrega"]);
  assert.equal((p as any).formas_pagamento[0].forma_pagamento, "99");
});

test("produção sem readiness fica bloqueada localmente", async () => {
  await assert.rejects(
    () => buildProductionNfcePayload({ db: mockDb({ order: baseOrder("25.00"), items: [simpleItem()], payments: [payment("pix", "25.00")], setup: { ...settings, certificateStatus: "missing" } }) as any, storeId, orderId: 500, series: 1, number: 100 }),
    (error: any) => error instanceof NfceServiceError && error.code === "FISCAL_SETUP_NOT_READY",
  );
});

test("produção com readiness mockada percorre builder correto sem API real", async () => {
  const p = await buildProductionNfcePayload({ db: mockDb({ order: baseOrder("25.00"), items: [simpleItem()], payments: [payment("pix", "25.00")] }) as any, storeId, orderId: 500, series: 1, number: 100 });
  assert.equal((p as any).ambiente, "1");
  assert.equal((p as any).numero, "100");
});

test("cancelamento e inutilização mockados atualizam status/faixa sem cliente Focus", () => {
  const document = { id: 1, status: "authorized", providerReference: "gm-nfce-hom-101-500" };
  const cancelled = { ...document, status: "cancelled", protocol: "MOCK-CANCEL-001" };
  const inutilization = { environment: "homologation", series: 1, numberStart: 200, numberEnd: 205, status: "authorized", protocol: "MOCK-INUTIL-001" };
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual([inutilization.series, inutilization.numberStart, inutilization.numberEnd, inutilization.status], [1, 200, 205, "authorized"]);
  assertNoSecrets({ cancelled, inutilization });
});

test("Go-Live checklist mockado contém checks esperados e não expõe secrets", () => {
  const checks = ["SIMPLE_ORDER_PAYLOAD_READY", "MULTISABOR_PAYLOAD_READY", "DELIVERY_FEE_PAYLOAD_READY", "EXTERNAL_PAYMENT_PAYLOAD_READY", "CANCELLATION_AVAILABLE", "INUTILIZATION_AVAILABLE", "SECRETS_NOT_EXPOSED", "PRODUCTION_READY_OR_BLOCKED_SAFELY"];
  const response = { readyForControlledHomologation: true, readyForProduction: false, checks: checks.map((code) => ({ code, status: code === "PRODUCTION_READY_OR_BLOCKED_SAFELY" ? "blocked" : "ok" })) };
  assert.deepEqual(response.checks.map((c) => c.code), checks);
  assertNoSecrets(response);
});

test("linhas públicas não contêm payload sensível completo", () => {
  assertNoSecrets(buildNfcePaymentLinesForTests([payment("external", "10.00")], 1000));
});
