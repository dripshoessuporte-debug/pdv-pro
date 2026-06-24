import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const outdir = path.resolve(".tmp/focus-nfe-tests");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({ entryPoints: ["src/integrations/focus-nfe/__tests__/client.test.ts"], bundle: true, platform: "node", format: "esm", outfile: path.join(outdir, "client.test.mjs"), logLevel: "silent" });
const result = spawnSync(process.execPath, ["--test", path.join(outdir, "client.test.mjs")], { stdio: "inherit" });
process.exit(result.status ?? 1);
