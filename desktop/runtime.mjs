import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const RUNTIME_FILE_NAME = "runtime.json";

export function desktopRuntimeFile(userDataPath) {
  return path.join(userDataPath, RUNTIME_FILE_NAME);
}

export function runtimeManifestRecord({ appVersion, appPid, apiPid, apiUrl, webUrl, executablePath, packaged, agentToken }) {
  if (typeof agentToken !== "string" || agentToken.length < 32) {
    throw new Error("A private per-launch agent token is required.");
  }
  return {
    schemaVersion: 2,
    runtimeKind: packaged ? "desktop-packaged" : "desktop-development",
    appVersion,
    appPid,
    apiPid,
    apiUrl,
    webUrl,
    executablePath,
    agentToken,
    startedAt: new Date().toISOString(),
  };
}

export function writeRuntimeManifest(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

export function removeOwnedRuntimeManifest(filePath, appPid) {
  try {
    const current = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (current?.appPid === appPid) fs.unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function defaultRuntimeFile() {
  return path.join(os.homedir(), "Library", "Application Support", "Mauth Studio", RUNTIME_FILE_NAME);
}

export function isAllowedAppNavigation(candidateUrl, appOrigin) {
  try {
    const candidate = new URL(candidateUrl);
    return candidate.origin === appOrigin;
  } catch {
    return false;
  }
}
