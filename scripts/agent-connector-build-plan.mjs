import path from "node:path";

export function agentConnectorBuildPaths(root) {
  const outputDirectory = path.join(root, "tmp", "macos", "mauth-agent");
  return {
    outputDirectory,
    bundlePath: path.join(outputDirectory, "mauth-agent-mcp.mjs"),
    launcherPath: path.join(outputDirectory, "mauth-agent-mcp"),
  };
}

export function agentConnectorLauncherSource() {
  return `#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONTENTS_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ELECTRON_RUN_AS_NODE=1 exec "$CONTENTS_DIR/MacOS/Mauth Studio" "$SCRIPT_DIR/mauth-agent-mcp.mjs" "$@"
`;
}
