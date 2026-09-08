import path from "node:path";

const APP_DIRECTORY_NAME = "Mauth Studio";

export function desktopUserDataDirectory({ platform, homeDirectory, env = {} }) {
  if (env.MAUTH_DESKTOP_USER_DATA) {
    if (!path.isAbsolute(env.MAUTH_DESKTOP_USER_DATA)) throw new Error("MAUTH_DESKTOP_USER_DATA must be an absolute path.");
    return env.MAUTH_DESKTOP_USER_DATA;
  }
  if (platform === "darwin") {
    return path.join(homeDirectory, "Library", "Application Support", APP_DIRECTORY_NAME);
  }
  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(homeDirectory, "AppData", "Roaming"), APP_DIRECTORY_NAME);
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(homeDirectory, ".config"), APP_DIRECTORY_NAME);
}

export function desktopRuntimeManifestPath({ platform, homeDirectory, env = {} }) {
  return path.join(desktopUserDataDirectory({ platform, homeDirectory, env }), "runtime.json");
}

export function developmentPythonExecutable(repoRoot, platform) {
  return platform === "win32"
    ? path.join(repoRoot, "apps", "api", ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, "apps", "api", ".venv", "bin", "python");
}

export function packagedSidecarExecutable(resourceRoot, platform) {
  return path.join(resourceRoot, "sidecars", "mauth-api", platform === "win32" ? "mauth-api.exe" : "mauth-api");
}

export function packagedAgentConnectorFileName(platform) {
  return platform === "win32" ? "mauth-agent-mcp.cmd" : "mauth-agent-mcp";
}
