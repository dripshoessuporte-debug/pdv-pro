import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

process.env.FISCAL_SECRETS_ENCRYPTION_KEY ??= "12345678901234567890123456789012";
process.env.DATABASE_URL ??= "postgres://fiscal_smoke:fiscal_smoke@localhost:5432/fiscal_smoke";

const outdir = path.resolve(".tmp/fiscal-smoke-tests");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const tests = [["src/integrations/focus-nfe/__tests__/fiscal-smoke.test.ts", "fiscal-smoke.test.mjs"]];
for (const [entry, file] of tests) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(outdir, file),
    logLevel: "silent",
    external: ["pg-native"],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
}
const result = spawnSync(process.execPath, ["--test", ...tests.map(([, file]) => path.join(outdir, file))], { stdio: "inherit" });
process.exit(result.status ?? 1);
