import assert from "node:assert/strict";
import test from "node:test";

import { agentConnectorBuildPaths, agentConnectorLauncherSource } from "./agent-connector-build-plan.mjs";

test("agent connector build paths remain inside the generated macOS tree", () => {
  assert.deepEqual(agentConnectorBuildPaths("/repo"), {
    outputDirectory: "/repo/tmp/macos/mauth-agent",
    bundlePath: "/repo/tmp/macos/mauth-agent/mauth-agent-mcp.mjs",
    launcherPath: "/repo/tmp/macos/mauth-agent/mauth-agent-mcp",
  });
});

test("launcher uses the app-owned Electron runtime in Node mode", () => {
  const source = agentConnectorLauncherSource();
  assert.match(source, /^#!\/bin\/sh/);
  assert.match(source, /ELECTRON_RUN_AS_NODE=1/);
  assert.match(source, /CONTENTS_DIR=.*\.\.\/\.\./);
  assert.match(source, /\$CONTENTS_DIR\/MacOS\/Mauth Studio/);
  assert.match(source, /mauth-agent-mcp\.mjs/);
  assert.match(source, /"\$@"/);
});
