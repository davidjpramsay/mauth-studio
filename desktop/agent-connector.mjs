import path from "node:path";

import { packagedAgentConnectorFileName } from "./platform-paths.mjs";

export const MAUTH_AGENT_CONNECTOR_INFO_CHANNEL = "mauth:agent-connector-info";
export const MAUTH_AGENT_SETUP_OPEN_CHANNEL = "mauth:open-agent-setup";

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

export function packagedAgentConnectorPath(resourceRoot, platform = process.platform) {
  return path.join(resourceRoot, "agent", packagedAgentConnectorFileName(platform));
}

function claudeDesktopConfiguration(command, args = []) {
  return JSON.stringify(
    {
      mcpServers: {
        mauth: {
          command,
          args,
        },
      },
    },
    null,
    2,
  );
}

export function agentConnectorInfo({ packaged, resourceRoot, repoRoot, version, available, platform = process.platform }) {
  const connectorPath = packagedAgentConnectorPath(resourceRoot, platform);
  const launchCommand = packaged ? connectorPath : "pnpm";
  const launchArgs = packaged ? [] : ["--dir", repoRoot, "agent:mcp"];
  const shellLaunch = [launchCommand, ...launchArgs].map(shellQuote).join(" ");

  return {
    available: Boolean(available),
    bundled: packaged,
    version,
    connectorPath: packaged ? connectorPath : null,
    launchCommand,
    launchArgs,
    codexSetupCommand: `codex mcp add mauth -- ${shellLaunch}`,
    claudeCodeSetupCommand: `claude mcp add mauth --scope user ${shellLaunch}`,
    claudeDesktopConfiguration: claudeDesktopConfiguration(launchCommand, launchArgs),
    doctorCommand: `${shellLaunch} --doctor`,
  };
}
