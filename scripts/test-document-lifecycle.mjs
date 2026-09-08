import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(path.join(tmpdir(), "mauth-lifecycle-tests-"));
try {
  const outfile = path.join(directory, "document-lifecycle.test.mjs");
  await build({
    entryPoints: ["apps/web/src/hooks/documentLifecycle.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "@": path.resolve("apps/web/src") },
    define: { "import.meta.env": "{}" },
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
