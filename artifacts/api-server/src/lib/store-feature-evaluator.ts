export type StoreFeature = "delivery" | "fiscal";

export type StoreFeatureAccess = {
  storeId: number;
  feature: StoreFeature;
  allowed: boolean;
  plan: string | null;
  status: string | null;
  billingUserId: number | null;
  code: "PLAN_UPGRADE_REQUIRED" | "SUBSCRIPTION_INACTIVE" | null;
};

export type BillingCandidate = {
  userId: number | null;
  plan: string | null;
  status: string | null;
};

const activeEntitlementStatuses = new Set(["active", "trialing"]);

function canUseStoreFeature(
  plan: string | null | undefined,
  feature: StoreFeature,
): boolean {
  if (feature === "delivery") return plan === "medio" || plan === "pro";
  if (feature === "fiscal") return plan === "pro";
  return false;
}

function hasActiveFeature(
  candidate: BillingCandidate,
  feature: StoreFeature,
): boolean {
  return (
    canUseStoreFeature(candidate.plan, feature) &&
    Boolean(candidate.status && activeEntitlementStatuses.has(candidate.status))
  );
}

export function evaluateStoreFeatureAccess(
  storeId: number,
  feature: StoreFeature,
  candidates: BillingCandidate[] | BillingCandidate | null,
  preferredUserId?: number | null,
): StoreFeatureAccess {
  const list = Array.isArray(candidates)
    ? candidates
    : candidates
      ? [candidates]
      : [];
  const preferred = preferredUserId
    ? list.find((candidate) => candidate.userId === preferredUserId)
    : null;
  const selected =
    (preferred && hasActiveFeature(preferred, feature) ? preferred : null) ??
    list.find((candidate) => hasActiveFeature(candidate, feature)) ??
    preferred ??
    list.find((candidate) => canUseStoreFeature(candidate.plan, feature)) ??
    list[0] ??
    null;

  const includedInPlan = list.some((candidate) =>
    canUseStoreFeature(candidate.plan, feature),
  );
  const allowed = Boolean(selected && hasActiveFeature(selected, feature));
  const plan = selected?.plan ?? null;
  const status = selected?.status ?? null;

  let code: StoreFeatureAccess["code"] = null;
  if (!allowed) {
    code = includedInPlan ? "SUBSCRIPTION_INACTIVE" : "PLAN_UPGRADE_REQUIRED";
  }

  return {
    storeId,
    feature,
    allowed,
    plan,
    status,
    billingUserId: selected?.userId ?? null,
    code,
  };
}
