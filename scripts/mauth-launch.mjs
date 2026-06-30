#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const API_BASE = (process.env.MAUTH_AGENT_API_URL || process.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const WEB_URL = (process.env.MAUTH_WEB_URL || "http://127.0.0.1:5173").replace(/\/+$/, "");
const args = new Set(process.argv.slice(2));
const noOpen = args.has("--no-open");
const startedProcesses = [];

function usage() {
  console.log(`Usage: pnpm dev:launch [--no-open]

Starts the local Mauth API and web app when needed, verifies the API through
/api/system/status, warns when an older API is already occupying the port, and
opens the web app unless --no-open is supplied.`);
}

if (args.has("--help") || args.has("-h")) {
  usage();
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

process.on("SIGINT", () => {
  stopStartedProcesses();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopStartedProcesses();
  process.exit(143);
});

const initialStatus = await readSystemStatus();
if (initialStatus.ok) {
  console.log(`ok   API ${initialStatus.json.apiVersion} started ${initialStatus.json.startedAt}`);
} else {
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
  console.error(`fail ${WEB_URL} responds, but it does not look like Mauth Studio.`);
  console.error("     Another process may be using the web port. Stop it or set MAUTH_WEB_URL to the correct Mauth web URL.");
  stopStartedProcesses();
  process.exit(1);
} else {
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

if (!noOpen) {
  const openCommand = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(openCommand, [WEB_URL], { stdio: "ignore", detached: true }).unref();
  console.log(`open ${WEB_URL}`);
}

if (startedProcesses.length) {
  console.log("Mauth is running. Press Ctrl+C here to stop processes started by this launcher.");
  await new Promise(() => undefined);
}
