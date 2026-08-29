#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveMauthRuntime } from "./mauth-runtime.mjs";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const connectorIndex = args.indexOf("--connector");
const appIndex = args.indexOf("--app");
const connectorPath = connectorIndex >= 0 ? args[connectorIndex + 1] : null;
const appPath = appIndex >= 0 ? args[appIndex + 1] : path.join(process.env.HOME ?? "", "Applications", "Mauth Studio.app");

if (!connectorPath) throw new Error("--connector requires the installed Mauth connector executable path.");
if (!appPath) throw new Error("--app requires the installed Mauth Studio.app path.");

const transport = new StdioClientTransport({ command: connectorPath, args: [], stderr: "pipe" });
const client = new Client({ name: "mauth-agent-relaunch-smoke", version: "1.0.0" });

async function snapshot(timeoutMs = 10_000) {
  return client.callTool({ name: "mauth_snapshot", arguments: {} }, undefined, {
    signal: AbortSignal.timeout(timeoutMs),
  });
}

try {
  await client.connect(transport);
  const initialRuntime = resolveMauthRuntime();
  const initial = await snapshot();
  assert.equal(initial.structuredContent?.httpStatus, 200, JSON.stringify(initial.structuredContent));

  await execFileAsync("osascript", ["-e", 'tell application "Mauth Studio" to quit']);
  let opened = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await execFileAsync("open", [appPath]);
      opened = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.equal(opened, true, "Mauth Studio did not reopen after its previous process terminated.");

  let relaunched = null;
  let relaunchedRuntime = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    relaunchedRuntime = resolveMauthRuntime();
    try {
      const candidate = await snapshot(5_000);
      if (candidate.structuredContent?.httpStatus === 200) {
        relaunched = candidate;
        break;
      }
    } catch {
      // The app may still be replacing its runtime manifest or starting its editor session.
    }
  }

  assert.ok(relaunched, "The same MCP process did not reconnect after Mauth Studio relaunched.");
  assert.notEqual(relaunchedRuntime?.apiUrl, initialRuntime.apiUrl, "The packaged relaunch should use a new dynamic API port.");
  console.log(
    `Mauth MCP relaunch smoke passed: the same connector followed the installed app from ${initialRuntime.apiUrl} to ${relaunchedRuntime.apiUrl}.`,
  );
} finally {
  await client.close();
}
