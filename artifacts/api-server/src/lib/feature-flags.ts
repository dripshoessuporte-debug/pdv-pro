import type { EntitlementPlan } from "@workspace/db";

export type PlanFeature = "delivery" | "fiscal";

const featureMatrix: Record<EntitlementPlan, Record<PlanFeature, boolean>> = {
  basico: { delivery: false, fiscal: false },
  medio: { delivery: true, fiscal: false },
  pro: { delivery: true, fiscal: true },
};

export function canUseFeature(plan: EntitlementPlan | null | undefined, feature: PlanFeature): boolean {
  if (!plan) return false;
  return featureMatrix[plan]?.[feature] ?? false;
}
