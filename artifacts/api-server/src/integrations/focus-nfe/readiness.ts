export type FiscalRuleShape = { ncm: unknown; cfop: unknown; commercialUnit: unknown; origin: unknown; icmsCode: unknown; pisCode: unknown; cofinsCode: unknown };
function hasText(value: unknown): boolean { return typeof value === "string" && value.length > 0; }
export function isFiscalRuleComplete(rule: FiscalRuleShape): boolean {
  return hasText(rule.ncm) && hasText(rule.cfop) && hasText(rule.commercialUnit) && hasText(rule.origin) && hasText(rule.icmsCode) && hasText(rule.pisCode) && hasText(rule.cofinsCode);
}
