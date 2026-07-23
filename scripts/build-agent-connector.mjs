#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { agentConnectorBuildPaths, agentConnectorLauncherSource } from "./agent-connector-build-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const paths = agentConnectorBuildPaths(ROOT);

fs.rmSync(paths.outputDirectory, { recursive: true, force: true });
fs.mkdirSync(paths.outputDirectory, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, "scripts", "mauth-agent-mcp.mjs")],
  outfile: paths.bundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  minify: false,
  define: {
    __MAUTH_CONNECTOR_VERSION__: JSON.stringify(packageJson.version),
  },
});

fs.writeFileSync(paths.launcherPath, agentConnectorLauncherSource(), { mode: 0o755 });
fs.chmodSync(paths.launcherPath, 0o755);

console.log(`Built Mauth Agent Connector ${packageJson.version} in ${paths.outputDirectory}`);
