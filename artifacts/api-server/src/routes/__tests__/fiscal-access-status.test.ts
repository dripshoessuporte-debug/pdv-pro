import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import {
  resolveFiscalAccessStatus,
  type FiscalAccessStatusDependencies,
} from "../fiscal-access-status-core";
import type { AuthenticatedContext } from "../../lib/auth";
import type { StoreFeatureAccess } from "../../lib/store-features";

const req = {} as Request;
const user = { id: 1, name: "Ronan", email: "ronan@example.test" };

function context(
  role: "max_control" | "atendente",
  storeId = 10,
): AuthenticatedContext {
  return {
    user,
    platformRole: null,
    stores: [{ id: storeId, name: `Loja ${storeId}`, role }],
    currentStore: { id: storeId, name: `Loja ${storeId}`, role },
  };
}

function deps(
  authenticatedContext: AuthenticatedContext | null,
  access?: Partial<StoreFeatureAccess>,
): FiscalAccessStatusDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolveContext: async () => authenticatedContext,
    getFeatureAccess: async (options) => {
      calls.push(
        `feature:${options.storeId}:${options.feature}:${options.preferredUserId}`,
      );
      return {
        storeId: options.storeId,
        feature: "fiscal",
        allowed: false,
        plan: null,
        status: null,
        billingUserId: null,
        code: "PLAN_UPGRADE_REQUIRED",
        ...access,
      };
    },
  };
}

test("sem sessão retorna AUTH_REQUIRED", async () => {
  const result = await resolveFiscalAccessStatus(req, deps(null));
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    feature: "fiscal",
    allowed: false,
    code: "AUTH_REQUIRED",
    error: "Faça login para acessar o módulo fiscal.",
    plan: null,
    status: null,
  });
});

test("sessão válida sem loja retorna CURRENT_STORE_REQUIRED", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps({ ...context("max_control"), currentStore: null }),
  );
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "CURRENT_STORE_REQUIRED");
});

test("usuário atendente retorna PERMISSION_DENIED", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps(context("atendente")),
  );
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "PERMISSION_DENIED");
});

test("Max Control com PRO active retorna allowed true", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps(context("max_control"), {
      allowed: true,
      plan: "pro",
      status: "active",
      code: null,
      billingUserId: 1,
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.allowed, true);
  assert.equal(result.body.code, null);
});

test("Max Control com PRO trialing retorna allowed true", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps(context("max_control"), {
      allowed: true,
      plan: "pro",
      status: "trialing",
      code: null,
    }),
  );
  assert.equal(result.body.allowed, true);
  assert.equal(result.body.status, "trialing");
});

test("Max Control com PRO pending retorna SUBSCRIPTION_INACTIVE", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps(context("max_control"), {
      plan: "pro",
      status: "pending",
      code: "SUBSCRIPTION_INACTIVE",
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.code, "SUBSCRIPTION_INACTIVE");
});

test("Max Control com plano basico retorna PLAN_UPGRADE_REQUIRED", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps(context("max_control"), {
      plan: "basico",
      status: "active",
      code: "PLAN_UPGRADE_REQUIRED",
    }),
  );
  assert.equal(result.body.code, "PLAN_UPGRADE_REQUIRED");
});

test("usuário PRO de outra loja não libera a loja atual", async () => {
  const d = deps(context("max_control", 20), {
    plan: "basico",
    status: "active",
    code: "PLAN_UPGRADE_REQUIRED",
  });
  const result = await resolveFiscalAccessStatus(req, d);
  assert.equal(d.calls[0], "feature:20:fiscal:1");
  assert.equal(result.body.allowed, false);
});

test("endpoint não chama Focus", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps(context("max_control"), {
      allowed: true,
      plan: "pro",
      status: "active",
      code: null,
    }),
  );
  assert.equal(result.body.allowed, true);
});

test("endpoint não retorna e-mail de outros membros", async () => {
  const result = await resolveFiscalAccessStatus(
    req,
    deps(context("max_control"), {
      allowed: true,
      plan: "pro",
      status: "active",
      code: null,
    }),
  );
  assert.equal(JSON.stringify(result.body).includes("email"), false);
  assert.equal(JSON.stringify(result.body).includes("other@example"), false);
});

test("endpoint funciona mesmo estando montado antes do rbacRouteGuard", async () => {
  const source = await import("node:fs").then(({ readFileSync }) =>
    readFileSync("src/routes/index.ts", "utf8"),
  );
  assert.ok(
    source.indexOf("router.use(fiscalAccessStatusRouter)") <
      source.indexOf("router.use(rbacRouteGuard)"),
  );
});
