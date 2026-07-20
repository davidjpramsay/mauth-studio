import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_API_URL = "http://127.0.0.1:8000";
const DEFAULT_WEB_URL = "http://127.0.0.1:5173";

export function defaultDesktopRuntimeFile(homeDirectory = os.homedir()) {
  return path.join(homeDirectory, "Library", "Application Support", "Mauth Studio", "runtime.json");
}

function localHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:") return null;
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) return null;
    return parsed.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function localAgentToken(value) {
  return typeof value === "string" && value.trim().length >= 32 ? value.trim() : null;
}

export function readDesktopRuntime(filePath) {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const apiUrl = localHttpUrl(record?.apiUrl);
    const webUrl = localHttpUrl(record?.webUrl);
    const agentToken = localAgentToken(record?.agentToken);
    if (![1, 2].includes(record?.schemaVersion) || !apiUrl || !webUrl || !Number.isInteger(record?.appPid)) return null;
    if (record.schemaVersion === 2 && !agentToken) return null;
    try {
      process.kill(record.appPid, 0);
    } catch {
      return null;
    }
    return { ...record, apiUrl, webUrl, agentToken, runtimeFile: filePath };
  } catch {
    return null;
  }
}

export function resolveMauthRuntime(env = process.env, homeDirectory = os.homedir()) {
  const explicitApi = localHttpUrl(env.MAUTH_AGENT_API_URL || env.VITE_API_URL);
  const explicitWeb = localHttpUrl(env.MAUTH_WEB_URL);
  if (explicitApi || explicitWeb) {
    return {
      apiUrl: explicitApi || DEFAULT_API_URL,
      webUrl: explicitWeb || DEFAULT_WEB_URL,
      source: "environment",
      runtimeFile: null,
      agentToken: localAgentToken(env.MAUTH_AGENT_TOKEN),
    };
  }

  const runtimeFile = env.MAUTH_RUNTIME_FILE || defaultDesktopRuntimeFile(homeDirectory);
  const desktopRuntime = readDesktopRuntime(runtimeFile);
  if (desktopRuntime) {
    return {
      apiUrl: desktopRuntime.apiUrl,
      webUrl: desktopRuntime.webUrl,
      source: desktopRuntime.runtimeKind || "desktop",
      runtimeFile,
      agentToken: desktopRuntime.agentToken,
    };
  }

  return {
    apiUrl: DEFAULT_API_URL,
    webUrl: DEFAULT_WEB_URL,
    source: "development-default",
    runtimeFile: null,
    agentToken: null,
  };
}

export function agentAuthorizationHeaders(runtime) {
  return runtime?.agentToken ? { Authorization: `Bearer ${runtime.agentToken}` } : {};
}
