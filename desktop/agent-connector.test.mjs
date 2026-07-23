import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { agentConnectorInfo, packagedAgentConnectorPath, shellQuote } from "./agent-connector.mjs";

test("packaged connector setup points directly into the signed app bundle", () => {
  const resourceRoot = "/Applications/Mauth Studio.app/Contents/Resources";
  const info = agentConnectorInfo({
    packaged: true,
    resourceRoot,
    repoRoot: "/unused",
    version: "0.1.2",
    available: true,
  });

  assert.equal(info.connectorPath, path.join(resourceRoot, "agent", "mauth-agent-mcp"));
  assert.equal(info.launchCommand, info.connectorPath);
  assert.deepEqual(info.launchArgs, []);
  assert.equal(info.available, true);
  assert.match(info.codexSetupCommand, /^codex mcp add mauth -- '/);
  assert.match(info.claudeCodeSetupCommand, /^claude mcp add mauth --scope user '/);
  assert.deepEqual(JSON.parse(info.claudeDesktopConfiguration), {
    mcpServers: { mauth: { command: info.connectorPath, args: [] } },
  });
  assert.doesNotMatch(JSON.stringify(info), /token|Authorization/i);
});

test("development setup retains the repository-backed connector", () => {
  const info = agentConnectorInfo({
    packaged: false,
    resourceRoot: "/repo",
    repoRoot: "/repo with spaces",
    version: "0.1.2",
    available: true,
  });

  assert.equal(info.connectorPath, null);
  assert.equal(info.launchCommand, "pnpm");
  assert.deepEqual(info.launchArgs, ["--dir", "/repo with spaces", "agent:mcp"]);
  assert.equal(info.codexSetupCommand, "codex mcp add mauth -- 'pnpm' '--dir' '/repo with spaces' 'agent:mcp'");
});

test("shellQuote safely preserves apostrophes", () => {
  assert.equal(shellQuote("David's App"), `'David'\"'\"'s App'`);
});

test("packagedAgentConnectorPath is stable", () => {
  assert.equal(
    packagedAgentConnectorPath("/Applications/Mauth Studio.app/Contents/Resources"),
    "/Applications/Mauth Studio.app/Contents/Resources/agent/mauth-agent-mcp",
  );
});
