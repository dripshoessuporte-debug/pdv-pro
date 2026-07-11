import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

process.env.FISCAL_SECRETS_ENCRYPTION_KEY ??=
  "12345678901234567890123456789012";
process.env.DATABASE_URL ??=
  "postgres://focus_nfe_tests:focus_nfe_tests@localhost:5432/focus_nfe_tests";
const outdir = path.resolve(".tmp/focus-nfe-tests");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const tests = [
  ["src/integrations/focus-nfe/__tests__/client.test.ts", "client.test.mjs"],
  ["src/integrations/focus-nfe/__tests__/nfce-contract.test.ts", "nfce-contract.test.mjs"],
  ["src/lib/fiscal-secrets/__tests__.test.ts", "fiscal-secrets.test.mjs"],
  [
    "src/integrations/focus-nfe/__tests__/company-service.test.ts",
    "company-service.test.mjs",
  ],
  ["src/lib/__tests__/store-features.test.ts", "store-features.test.mjs"],
  [
    "src/routes/__tests__/fiscal-access-status.test.ts",
    "fiscal-access-status.test.mjs",
  ],
  [
    "src/routes/__tests__/fiscal-focus-status.test.ts",
    "fiscal-focus-status.test.mjs",
  ],
  [
    "src/routes/__tests__/fiscal-preflight-release.test.ts",
    "fiscal-preflight-release.test.mjs",
  ],
];
for (const [entry, file] of tests) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(outdir, file),
    logLevel: "silent",
    external: ["pg-native"],
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
}
const result = spawnSync(
  process.execPath,
  ["--test", ...tests.map(([, file]) => path.join(outdir, file))],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
