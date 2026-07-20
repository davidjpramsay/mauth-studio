import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import electronUpdater from "electron-updater";

import {
  desktopRuntimeFile,
  isAllowedAppNavigation,
  removeOwnedRuntimeManifest,
  runtimeManifestRecord,
  writeRuntimeManifest,
} from "./runtime.mjs";
import { createDesktopUpdaterController } from "./updater.mjs";

const DESKTOP_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DESKTOP_DIR, "..");
const APP_ID = "au.edu.acc.mauth-studio";
const API_READY_TIMEOUT_MS = 45_000;

let mainWindow = null;
let apiProcess = null;
let runtimeFile = null;
let quitting = false;
let updateController = null;

const { autoUpdater } = electronUpdater;

app.setName("Mauth Studio");
app.setAppUserModelId(APP_ID);
app.setPath("userData", path.join(app.getPath("appData"), "Mauth Studio"));
const desktopLogPath = path.join(app.getPath("userData"), "desktop.log");
fs.mkdirSync(path.dirname(desktopLogPath), { recursive: true });
function desktopLog(message) {
  fs.appendFileSync(desktopLogPath, `${new Date().toISOString()} ${message}\n`);
}
process.on("uncaughtException", (error) => desktopLog(`uncaughtException ${error.stack || error.message}`));
process.on("unhandledRejection", (error) => desktopLog(`unhandledRejection ${error instanceof Error ? error.stack : String(error)}`));

const ownsInstanceLock = app.requestSingleInstanceLock();
desktopLog(`startup packaged=${app.isPackaged} pid=${process.pid} ownsInstanceLock=${ownsInstanceLock}`);
if (!ownsInstanceLock) {
  app.quit();
  process.exit(0);
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function desktopPaths() {
  const resourceRoot = app.isPackaged ? process.resourcesPath : REPO_ROOT;
  return {
    resourceRoot,
    webDist: app.isPackaged ? path.join(resourceRoot, "web-dist") : path.join(REPO_ROOT, "apps", "web", "dist"),
    apiExecutable: app.isPackaged
      ? path.join(resourceRoot, "sidecars", "mauth-api")
      : path.join(REPO_ROOT, "apps", "api", ".venv", "bin", "python"),
    icon: app.isPackaged ? path.join(resourceRoot, "mauth-icon.png") : path.join(REPO_ROOT, "docs", "assets", "mauth-icon.png"),
  };
}

function openLogStream(name) {
  const logDirectory = app.getPath("logs");
  fs.mkdirSync(logDirectory, { recursive: true });
  return fs.openSync(path.join(logDirectory, name), "a");
}

function startApi(port, agentToken) {
  const paths = desktopPaths();
  const webUrl = `http://127.0.0.1:${port}`;
  const args = app.isPackaged
    ? ["--port", String(port), "--web-dist", paths.webDist, "--parent-pid", String(process.pid)]
    : ["-m", "app.standalone", "--port", String(port), "--web-dist", paths.webDist, "--parent-pid", String(process.pid)];
  const apiLog = openLogStream("api.log");
  const env = {
    ...process.env,
    MAUTH_APP_VERSION: app.getVersion(),
    MAUTH_AGENT_TOKEN: agentToken,
    MAUTH_LOG_LEVEL: app.isPackaged ? "warning" : "info",
    MAUTH_NODE_BINARY: process.execPath,
    MAUTH_NODE_RUN_AS_NODE: "1",
    MAUTH_RESOURCE_ROOT: paths.resourceRoot,
    MAUTH_RUNTIME_KIND: app.isPackaged ? "desktop-packaged" : "desktop-development",
    MAUTH_WEB_DIST: paths.webDist,
    MAUTH_WEB_URL: webUrl,
    ...(app.isPackaged ? { MAUTH_WORKSPACE_STATE_ROOT: path.join(app.getPath("userData"), "storage") } : {}),
  };

  apiProcess = spawn(paths.apiExecutable, args, {
    cwd: app.isPackaged ? paths.resourceRoot : path.join(REPO_ROOT, "apps", "api"),
    env,
    stdio: ["ignore", apiLog, apiLog],
  });
  fs.closeSync(apiLog);
  apiProcess.once("exit", (code, signal) => {
    if (!quitting) {
      dialog.showErrorBox(
        "Mauth Studio stopped",
        `The local mathematics service exited unexpectedly (${signal || `code ${code ?? "unknown"}`}). Reopen Mauth Studio to restart it.`,
      );
      app.quit();
    }
  });
  return { webUrl, paths };
}

async function waitForApi(webUrl) {
  const deadline = Date.now() + API_READY_TIMEOUT_MS;
  let lastError = "API did not respond";
  while (Date.now() < deadline) {
    if (apiProcess?.exitCode !== null) throw new Error(`API exited with code ${apiProcess?.exitCode}`);
    try {
      const response = await fetch(`${webUrl}/api/system/status`, { cache: "no-store" });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for the Mauth service: ${lastError}`);
}

function createApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Mauth Studio",
      submenu: [
        { role: "about" },
        updateController?.menuItem() ?? { label: "Check for Updates…", enabled: false },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { label: "File", submenu: [{ role: "close" }] },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] },
  ]);
}

function refreshApplicationMenu() {
  Menu.setApplicationMenu(createApplicationMenu());
}

function createWindow(webUrl, icon, agentToken) {
  const appOrigin = new URL(webUrl).origin;
  mainWindow = new BrowserWindow({
    title: "Mauth Studio",
    width: 1560,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f8fafc",
    icon,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: [`${appOrigin}/api/*`] }, (details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        Authorization: `Bearer ${agentToken}`,
      },
    });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppNavigation(url, appOrigin)) return { action: "allow" };
    if (/^(https?:|mailto:)/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppNavigation(url, appOrigin)) return;
    event.preventDefault();
    if (/^(https?:|mailto:)/.test(url)) void shell.openExternal(url);
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "question",
      title: "Close Mauth Studio?",
      message: "Close Mauth Studio?",
      detail: "Your current draft has been backed up. Saved files are unchanged.",
      buttons: ["Close Mauth Studio", "Keep Editing"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) {
      quitting = true;
      event.preventDefault();
    } else {
      quitting = false;
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(webUrl);
}

function stopApi() {
  if (!apiProcess || apiProcess.killed || apiProcess.exitCode !== null) return;
  apiProcess.kill("SIGTERM");
  apiProcess = null;
}

async function launch() {
  desktopLog("launch started");
  const port = await findAvailablePort();
  if (!port) throw new Error("Could not reserve a local port for Mauth Studio.");
  const agentToken = randomBytes(32).toString("base64url");
  const { webUrl, paths } = startApi(port, agentToken);
  desktopLog(`api spawned pid=${apiProcess?.pid ?? "unknown"} url=${webUrl}`);
  await waitForApi(webUrl);
  desktopLog("api ready");
  runtimeFile = desktopRuntimeFile(app.getPath("userData"));
  writeRuntimeManifest(
    runtimeFile,
    runtimeManifestRecord({
      appVersion: app.getVersion(),
      appPid: process.pid,
      apiPid: apiProcess?.pid,
      apiUrl: webUrl,
      webUrl,
      executablePath: process.execPath,
      packaged: app.isPackaged,
      agentToken,
    }),
  );
  const updatesEnabled = app.isPackaged && fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
  updateController = createDesktopUpdaterController({
    enabled: updatesEnabled,
    updater: autoUpdater,
    dialog,
    getWindow: () => mainWindow,
    log: desktopLog,
    refreshMenu: refreshApplicationMenu,
  });
  if (app.isPackaged && !updatesEnabled) desktopLog("updater disabled because app-update.yml is unavailable");
  refreshApplicationMenu();
  createWindow(webUrl, paths.icon, agentToken);
  updateController.scheduleAutomaticCheck();
  desktopLog("window created");
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => {
  updateController?.dispose();
  if (runtimeFile) removeOwnedRuntimeManifest(runtimeFile, process.pid);
  stopApi();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(async () => {
  desktopLog("electron ready");
  try {
    await launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    desktopLog(`launch failed ${error instanceof Error ? error.stack : message}`);
    dialog.showErrorBox("Mauth Studio could not start", `${message}\n\nLogs are available in ${app.getPath("logs")}.`);
    app.quit();
  }
});
