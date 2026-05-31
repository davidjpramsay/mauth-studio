#!/usr/bin/env node

const API_BASE = (process.env.MAUTH_AGENT_API_URL || process.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const WEB_URL = (process.env.MAUTH_WEB_URL || "http://127.0.0.1:5173").replace(/\/+$/, "");

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function line(ok, label, detail) {
  const marker = ok ? "ok" : "fail";
  console.log(`${marker.padEnd(4)} ${label}${detail ? ` - ${detail}` : ""}`);
}

async function checkMcpDependency() {
  try {
    await import("@modelcontextprotocol/sdk/server/mcp.js");
    await import("zod/v4");
    line(true, "MCP dependencies", "@modelcontextprotocol/sdk and zod are importable");
    return true;
  } catch (error) {
    line(false, "MCP dependencies", error instanceof Error ? error.message : "missing dependency");
    return false;
  }
}

async function checkHttp(label, url, { expectJson = false, allowAppNotConnected = false } = {}) {
  try {
    const response = await fetchWithTimeout(url);
    const body = expectJson ? await readJson(response) : await response.text();
    if (allowAppNotConnected && response.status === 503 && body && typeof body === "object" && body.code === "APP_NOT_CONNECTED") {
      line(false, label, "API is up, but no browser editor session is connected");
      return false;
    }
    if (!response.ok) {
      const detail =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : typeof body === "string"
            ? body.slice(0, 120)
            : `HTTP ${response.status}`;
      line(false, label, detail || `HTTP ${response.status}`);
      return false;
    }
    line(true, label, `HTTP ${response.status}`);
    return true;
  } catch (error) {
    line(false, label, error instanceof Error ? error.message : "request failed");
    return false;
  }
}

const checks = [];
checks.push(await checkMcpDependency());
checks.push(await checkHttp("API health", `${API_BASE}/api/health`, { expectJson: true }));
checks.push(await checkHttp("Web app", WEB_URL));
checks.push(await checkHttp("Bridge discovery", `${API_BASE}/.well-known/mauth-agent.json`, { expectJson: true }));
checks.push(
  await checkHttp("Active editor snapshot", `${API_BASE}/api/agent/current/snapshot`, { expectJson: true, allowAppNotConnected: true }),
);

const allOk = checks.every(Boolean);
if (!allOk) {
  console.log("\nStart the local stack, open the web app, then retry:");
  console.log("  pnpm dev:api");
  console.log("  pnpm dev:web");
  console.log(`  open ${WEB_URL}`);
  process.exitCode = 1;
}
