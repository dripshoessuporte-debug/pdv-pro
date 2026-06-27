import test from "node:test";
import assert from "node:assert/strict";
import { evaluateStoreFeatureAccess } from "../store-feature-evaluator";

const storeId = 10;

test("preferred Max Control with active PRO releases fiscal", () => {
  const access = evaluateStoreFeatureAccess(
    storeId,
    "fiscal",
    [
      { userId: 1, plan: "basico", status: "active" },
      { userId: 2, plan: "pro", status: "active" },
    ],
    2,
  );
  assert.equal(access.allowed, true);
  assert.equal(access.billingUserId, 2);
  assert.equal(access.code, null);
});

test("active PRO releases fiscal regardless of Max Control ordering", () => {
  const access = evaluateStoreFeatureAccess(storeId, "fiscal", [
    { userId: 1, plan: "basico", status: "active" },
    { userId: 2, plan: "pro", status: "active" },
  ]);
  assert.equal(access.allowed, true);
  assert.equal(access.billingUserId, 2);
});

test("PRO trialing releases fiscal", () => {
  const access = evaluateStoreFeatureAccess(storeId, "fiscal", [
    { userId: 1, plan: "pro", status: "trialing" },
  ]);
  assert.equal(access.allowed, true);
});

test("PRO pending returns SUBSCRIPTION_INACTIVE", () => {
  const access = evaluateStoreFeatureAccess(storeId, "fiscal", [
    { userId: 1, plan: "pro", status: "pending" },
  ]);
  assert.equal(access.allowed, false);
  assert.equal(access.code, "SUBSCRIPTION_INACTIVE");
});

test("PRO past_due returns SUBSCRIPTION_INACTIVE", () => {
  const access = evaluateStoreFeatureAccess(storeId, "fiscal", [
    { userId: 1, plan: "pro", status: "past_due" },
  ]);
  assert.equal(access.allowed, false);
  assert.equal(access.code, "SUBSCRIPTION_INACTIVE");
});

test("only basico returns PLAN_UPGRADE_REQUIRED", () => {
  const access = evaluateStoreFeatureAccess(storeId, "fiscal", [
    { userId: 1, plan: "basico", status: "active" },
  ]);
  assert.equal(access.allowed, false);
  assert.equal(access.code, "PLAN_UPGRADE_REQUIRED");
});

test("medio does not release fiscal but releases delivery", () => {
  const candidates = [{ userId: 1, plan: "medio", status: "active" }];
  assert.equal(evaluateStoreFeatureAccess(storeId, "fiscal", candidates).allowed, false);
  assert.equal(evaluateStoreFeatureAccess(storeId, "delivery", candidates).allowed, true);
});

test("preferred user is ignored when absent from store candidates", () => {
  const access = evaluateStoreFeatureAccess(
    storeId,
    "fiscal",
    [{ userId: 1, plan: "basico", status: "active" }],
    99,
  );
  assert.equal(access.allowed, false);
  assert.equal(access.billingUserId, 1);
  assert.equal(access.code, "PLAN_UPGRADE_REQUIRED");
});

// The database query that feeds evaluateStoreFeatureAccess filters candidates to
// active users, active memberships, the current store, and role max_control. This
// prevents PRO users from other stores, inactive members, and attendants from
// becoming billing owners, and the pure tests above ensure Focus is not called.
