export type Plan = "basico" | "medio" | "pro";
export type Feature = "delivery" | "fiscal";

export function canUseFeature(plan: Plan | null | undefined, feature: Feature): boolean {
  if (plan === "pro") return true;
  if (plan === "medio") return feature === "delivery";
  return false;
}
