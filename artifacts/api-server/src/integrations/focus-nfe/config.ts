import type { FocusNfeEnvironment } from "./types";

export const FOCUS_NFE_BASE_URLS: Record<FocusNfeEnvironment, string> = {
  homologation: "https://homologacao.focusnfe.com.br",
  production: "https://api.focusnfe.com.br",
};

export const DEFAULT_FOCUS_NFE_TIMEOUT_MS = 15_000;

export type FocusNfeConfig = {
  baseUrls: Record<FocusNfeEnvironment, string>;
  timeoutMs: number;
};

function positiveIntegerFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getFocusNfeConfig(env: NodeJS.ProcessEnv = process.env): FocusNfeConfig {
  return {
    baseUrls: {
      homologation: env.FOCUS_NFE_HOMOLOGATION_BASE_URL || FOCUS_NFE_BASE_URLS.homologation,
      production: env.FOCUS_NFE_PRODUCTION_BASE_URL || FOCUS_NFE_BASE_URLS.production,
    },
    timeoutMs: positiveIntegerFromEnv(env.FOCUS_NFE_TIMEOUT_MS, DEFAULT_FOCUS_NFE_TIMEOUT_MS),
  };
}

export function resolveFocusNfeToken(
  environment: FocusNfeEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): { token: string | null; tokenReference: string } {
  const key = environment === "production" ? "FOCUS_NFE_PRODUCTION_TOKEN" : "FOCUS_NFE_HOMOLOGATION_TOKEN";
  return { token: env[key] || null, tokenReference: key };
}
