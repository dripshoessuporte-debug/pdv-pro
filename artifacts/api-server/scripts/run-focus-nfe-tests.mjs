import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

process.env.DATABASE_URL ??= "postgres://focus:test@127.0.0.1:1/focus_tests";
process.env.FISCAL_SECRETS_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const outdir = path.resolve(".tmp/focus-nfe-tests");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const tests = [
  ["src/integrations/focus-nfe/__tests__/client.test.ts", "client.test.cjs"],
  ["src/integrations/focus-nfe/__tests__/company-service-hardening.test.ts", "company-service-hardening.test.cjs"],
  ["src/lib/fiscal-secrets/__tests__.test.ts", "fiscal-secrets.test.cjs"],
];
for (const [entry, file] of tests) {
  await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", outfile: path.join(outdir, file), logLevel: "silent", external: ["pg-native"] });
}
const result = spawnSync(process.execPath, ["--test", ...tests.map(([, file]) => path.join(outdir, file))], { stdio: "inherit" });
process.exit(result.status ?? 1);
