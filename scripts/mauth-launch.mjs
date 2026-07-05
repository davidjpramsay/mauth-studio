#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

import { desktopReplacementReasons, listenersAreAmbiguous, runtimeStatusSummary } from "./mauth-launch-plan.mjs";

const API_BASE = (process.env.MAUTH_AGENT_API_URL || process.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const WEB_URL = (process.env.MAUTH_WEB_URL || "http://127.0.0.1:5173").replace(/\/+$/, "");
const args = new Set(process.argv.slice(2));
const noOpen = args.has("--no-open");
const replaceExisting = args.has("--replace");
const replaceAmbiguous = args.has("--replace-ambiguous");
const statusOnly = args.has("--status");
const stopOnly = args.has("--stop");
const startedProcesses = [];
const repoRoot = process.cwd();

function usage() {
  console.log(`Usage: pnpm dev:launch [--no-open] [--replace] [--replace-ambiguous] [--status] [--stop]

Starts the local Mauth API and web app when needed, verifies the API through
/api/system/status, warns when an older API is already occupying the port, and
opens the web app unless --no-open is supplied.

Options:
  --no-open   Start/check servers without opening the browser.
  --replace   Stop Mauth-owned dev servers on the configured API/web ports first,
              then start a fresh launcher-owned session.
  --replace-ambiguous
              Desktop-safe mode: replace stale or partial Mauth-owned runtimes
              and same-port listener addresses that could show different builds.
  --status   Print API/web health and listener ownership without starting servers.
  --stop     Stop Mauth-owned listeners on the configured API/web ports and exit.`);
}

if (args.has("--help") || args.has("-h")) {
  usage();
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandExists(command) {
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function portFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.port) return Number(parsed.port);
    if (parsed.protocol === "https:") return 443;
    if (parsed.protocol === "http:") return 80;
  } catch {
    // Keep launch resilient when custom env URLs are malformed; the fetch step
    // will report the actual URL failure.
  }
  return null;
}

function readProcessCommand(pid) {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readProcessCwd(pid) {
  if (!commandExists("lsof")) return "";
  const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  if (result.status !== 0) return "";
  const cwdLine = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("n"));
  return cwdLine ? cwdLine.slice(1) : "";
}

function parseLsofFieldOutput(output) {
  const listeners = [];
  let current = null;
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const field = line[0];
    const value = line.slice(1);
    if (field === "p") {
      if (current) listeners.push(current);
      current = { pid: Number(value), commandName: "", names: [] };
    } else if (field === "c" && current) {
      current.commandName = value;
    } else if (field === "n" && current) {
      current.names.push(value);
    }
  }
  if (current) listeners.push(current);
  return listeners
    .filter((listener) => Number.isFinite(listener.pid))
    .map((listener) => {
      const command = readProcessCommand(listener.pid);
      const cwd = readProcessCwd(listener.pid);
      return {
        ...listener,
        command,
        cwd,
        isMauthOwned: isMauthOwnedProcess(command, cwd),
      };
    });
}

function listenersForPort(port) {
  if (!port || !commandExists("lsof")) return [];
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpcn"], { encoding: "utf8" });
  if (result.status !== 0 && !result.stdout) return [];
  return parseLsofFieldOutput(result.stdout);
}

function isPathInsideRepo(value) {
  return value === repoRoot || value.startsWith(`${repoRoot}/`);
}

function isMauthOwnedProcess(command, cwd) {
  return isPathInsideRepo(cwd) || command.includes(repoRoot);
}

function listenerProcessSummary(listener) {
  const command = listener.command || listener.commandName || "unknown command";
  const names = listener.names.length ? ` ${listener.names.join(", ")}` : "";
  const owner = listener.isMauthOwned ? "Mauth" : "external";
  return `pid ${listener.pid} (${owner}) ${command}${names}`;
}

function printListeners(label, port, listeners, level = "warn") {
  if (!listeners.length) return;
  const print = level === "error" ? console.error : console.log;
  print(
    `${level === "error" ? "fail" : "warn"} ${label} port ${port} has ${listeners.length} listener${listeners.length === 1 ? "" : "s"}:`,
  );
  for (const listener of listeners) {
    print(`     ${listenerProcessSummary(listener)}`);
  }
}

function printPortStatus(label, port, listeners) {
  if (!port) {
    console.log(`warn ${label}: no port could be inferred from configured URL`);
    return;
  }
  if (!listeners.length) {
    console.log(`ok   ${label} port ${port}: no listeners`);
    return;
  }
  console.log(`info ${label} port ${port}: ${listeners.length} listener${listeners.length === 1 ? "" : "s"}`);
  for (const listener of listeners) {
    console.log(`     ${listenerProcessSummary(listener)}`);
  }
}

async function waitForMauthListenersToStop(port, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!listenersForPort(port).some((listener) => listener.isMauthOwned)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for Mauth-owned listeners on port ${port} to stop.`);
}

async function replaceAmbiguousMauthListeners(label, port) {
  const listeners = listenersForPort(port);
  if (!listenersAreAmbiguous(listeners)) return;
  printListeners(label, port, listeners, "warn");
  console.log("     Replacing Mauth-owned listeners to avoid stale localhost/127.0.0.1 app versions.");
  await stopMauthListeners(label.toLowerCase(), port);
}

async function replaceDesktopRiskyMauthListeners() {
  const [status, web] = await Promise.all([readSystemStatus(), webHealth()]);
  const apiListeners = listenersForPort(apiPort);
  const webListeners = listenersForPort(webPort);
  const reasons = desktopReplacementReasons({
    apiHealthy: status.ok,
    webHealthy: web.ok && web.isMauth,
    apiListeners,
    webListeners,
  });
  if (!reasons.length) return;

  console.log("warn Desktop launcher found a stale or partial Mauth runtime:");
  for (const reason of reasons) {
    console.log(`     ${reason}`);
  }
  printListeners("API", apiPort, apiListeners, "warn");
  printListeners("Web", webPort, webListeners, "warn");
  console.log("     Restarting Mauth-owned listeners so the browser opens against one fresh API/web pair.");
  await stopMauthListeners("web", webPort);
  await stopMauthListeners("api", apiPort);
}

async function stopMauthListeners(label, port) {
  const listeners = listenersForPort(port).filter((listener) => listener.isMauthOwned);
  if (!listeners.length) {
    if (stopOnly) console.log(`ok   ${label}: no Mauth-owned listeners on port ${port}`);
    return;
  }
  console.log(`stop ${label}: ${listeners.length} Mauth-owned listener${listeners.length === 1 ? "" : "s"} on port ${port}`);
  for (const listener of listeners) {
    try {
      process.kill(listener.pid, "SIGTERM");
      console.log(`     sent SIGTERM to pid ${listener.pid}`);
    } catch (error) {
      console.log(`     could not stop pid ${listener.pid}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  await waitForMauthListenersToStop(port);
}

async function fetchText(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, text: error instanceof Error ? error.message : "request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, timeoutMs = 1500) {
  const result = await fetchText(url, timeoutMs);
  if (!result.ok) return { ...result, json: null };
  try {
    return { ...result, json: JSON.parse(result.text) };
  } catch {
    return { ...result, ok: false, json: null };
  }
}

async function readSystemStatus() {
  return fetchJson(`${API_BASE}/api/system/status`);
}

async function apiHealth() {
  return fetchJson(`${API_BASE}/api/health`);
}

async function webHealth() {
  const response = await fetchText(WEB_URL);
  return {
    ...response,
    isMauth: response.ok && /Mauth Studio|id="root"|\/src\/main/.test(response.text),
  };
}

function startProcess(label, command, commandArgs) {
  console.log(`start ${label}: ${command} ${commandArgs.join(" ")}`);
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  startedProcesses.push(child);
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${label} stopped by ${signal}`);
    } else if (code) {
      console.log(`${label} exited with code ${code}`);
    }
  });
  return child;
}

async function waitFor(label, check, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastResult = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastResult = await check();
    if (lastResult.ok) return lastResult;
    await sleep(500);
  }
  throw new Error(`${label} did not become ready. Last status: ${lastResult?.status ?? "none"} ${lastResult?.text ?? ""}`.trim());
}

function stopStartedProcesses() {
  for (const child of startedProcesses) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

function warnAboutAmbiguousListeners(label, port) {
  const listeners = listenersForPort(port);
  if (!listenersAreAmbiguous(listeners)) return;
  printListeners(label, port, listeners);
  console.log("     Multiple listener addresses can make localhost and 127.0.0.1 show different Mauth versions.");
  console.log("     Run pnpm dev:launch --replace, or use --replace-ambiguous for the desktop-safe cleanup mode.");
}

function failForPortConflict(label, port, listeners, detail) {
  printListeners(label, port, listeners, "error");
  console.error(`     ${detail}`);
  if (listeners.some((listener) => listener.isMauthOwned)) {
    console.error("     Run pnpm dev:launch --replace to stop Mauth-owned dev servers and start a fresh session.");
  }
  stopStartedProcesses();
  process.exit(1);
}

async function printRuntimeStatus() {
  const apiListeners = listenersForPort(apiPort);
  printPortStatus("API", apiPort, apiListeners);
  const status = await readSystemStatus();
  if (status.ok) {
    console.log(`ok   API status: ${status.json.apiVersion} started ${status.json.startedAt}`);
    console.log(`ok   Documents folder: ${status.json.workspace.documentsPath}`);
    console.log(`ok   Bridge route: ${status.json.bridge.routes.browserRegister}`);
  } else {
    console.log(`warn API status: ${status.status || "unreachable"} ${status.text}`);
  }

  const webListeners = listenersForPort(webPort);
  printPortStatus("Web", webPort, webListeners);
  const web = await webHealth();
  if (web.ok && web.isMauth) {
    console.log(`ok   Web app: ${WEB_URL}`);
  } else if (web.ok) {
    console.log(`warn Web app: ${WEB_URL} responds but does not look like Mauth Studio`);
  } else {
    console.log(`warn Web app: ${WEB_URL} unreachable (${web.text})`);
  }

  const summary = runtimeStatusSummary({
    apiHealthy: status.ok,
    webHealthy: web.ok && web.isMauth,
    apiListeners,
    webListeners,
    webUrl: WEB_URL,
  });
  console.log(`${summary.level.padEnd(4)} Runtime: ${summary.message}`);
  console.log(`     ${summary.detail}`);
}

process.on("SIGINT", () => {
  stopStartedProcesses();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopStartedProcesses();
  process.exit(143);
});

const apiPort = portFromUrl(API_BASE);
const webPort = portFromUrl(WEB_URL);

if (statusOnly) {
  await printRuntimeStatus();
  process.exit(0);
}

if (stopOnly) {
  await stopMauthListeners("web", webPort);
  await stopMauthListeners("api", apiPort);
  process.exit(0);
}

if (replaceExisting) {
  await stopMauthListeners("web", webPort);
  await stopMauthListeners("api", apiPort);
} else if (replaceAmbiguous) {
  await replaceAmbiguousMauthListeners("Web", webPort);
  await replaceAmbiguousMauthListeners("API", apiPort);
  await replaceDesktopRiskyMauthListeners();
}

const initialStatus = await readSystemStatus();
if (initialStatus.ok) {
  console.log(`ok   API ${initialStatus.json.apiVersion} started ${initialStatus.json.startedAt}`);
} else {
  const apiListeners = listenersForPort(apiPort);
  if (apiListeners.length) {
    const health = await apiHealth();
    if (health.ok) {
      failForPortConflict(
        "API",
        apiPort,
        apiListeners,
        "API health responds, but /api/system/status is missing. An older Mauth API is probably still running.",
      );
    }
    failForPortConflict("API", apiPort, apiListeners, `${API_BASE} is not healthy, but the API port is occupied.`);
  }
  const health = await apiHealth();
  if (health.ok) {
    console.error("fail API health responds, but /api/system/status is missing.");
    console.error("     An older Mauth API process is probably still running on port 8000. Stop it, then rerun pnpm dev:launch.");
    process.exit(1);
  }
  startProcess("api", "pnpm", ["dev:api"]);
  const readyStatus = await waitFor("API", readSystemStatus);
  console.log(`ok   API ${readyStatus.json.apiVersion} started ${readyStatus.json.startedAt}`);
}

const initialWeb = await webHealth();
if (initialWeb.ok && initialWeb.isMauth) {
  console.log(`ok   Web app at ${WEB_URL}`);
} else if (initialWeb.ok) {
  failForPortConflict(
    "Web",
    webPort,
    listenersForPort(webPort),
    `${WEB_URL} responds, but it does not look like Mauth Studio. Stop the conflicting process or set MAUTH_WEB_URL to the correct Mauth web URL.`,
  );
} else {
  const webListeners = listenersForPort(webPort);
  if (webListeners.length) {
    failForPortConflict("Web", webPort, webListeners, `${WEB_URL} is not reachable, but the web port is occupied.`);
  }
  startProcess("web", "pnpm", ["dev:web"]);
  await waitFor("Web app", async () => {
    const current = await webHealth();
    return { ...current, ok: current.ok && current.isMauth };
  });
  console.log(`ok   Web app at ${WEB_URL}`);
}

const finalStatus = await readSystemStatus();
if (!finalStatus.ok) {
  console.error("fail API status disappeared after launch.");
  stopStartedProcesses();
  process.exit(1);
}

console.log(`ok   Documents folder: ${finalStatus.json.workspace.documentsPath}`);
console.log(`ok   Bridge route: ${finalStatus.json.bridge.routes.browserRegister}`);
warnAboutAmbiguousListeners("API", apiPort);
warnAboutAmbiguousListeners("Web", webPort);

if (!noOpen) {
  const openCommand = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(openCommand, [WEB_URL], { stdio: "ignore", detached: true }).unref();
  console.log(`open ${WEB_URL}`);
}

if (startedProcesses.length) {
  console.log("Mauth is running. Press Ctrl+C here to stop processes started by this launcher.");
  await new Promise(() => undefined);
} else {
  console.log("Mauth was already running. This launcher did not start new API/web processes.");
  console.log("Stop the original Terminal sessions when you want to shut those servers down, or rerun with --replace for a clean restart.");
}
