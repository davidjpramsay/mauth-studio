const DEFAULT_CHECK_DELAY_MS = 15_000;
const MAX_RELEASE_NOTES_LENGTH = 1_600;

export function initialDesktopUpdateState() {
  return {
    status: "idle",
    version: null,
    percent: null,
    error: null,
  };
}

export function releaseNotesText(updateInfo) {
  const notes = updateInfo?.releaseNotes;
  const text = Array.isArray(notes)
    ? notes
        .map((entry) => (typeof entry === "string" ? entry : entry?.note))
        .filter(Boolean)
        .join("\n\n")
    : typeof notes === "string"
      ? notes
      : "";
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "This update includes the changes described on the Mauth Studio release page.";
  if (normalized.length <= MAX_RELEASE_NOTES_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_RELEASE_NOTES_LENGTH - 1).trimEnd()}…`;
}

export function desktopUpdateMenuPresentation(state, enabled = true) {
  if (!enabled) {
    return { label: "Check for Updates…", enabled: false, action: "check" };
  }
  if (state.status === "checking") {
    return { label: "Checking for Updates…", enabled: false, action: "check" };
  }
  if (state.status === "downloading") {
    const percent = Number.isFinite(state.percent) ? ` (${Math.round(state.percent)}%)` : "";
    return { label: `Downloading Update${percent}…`, enabled: false, action: "download" };
  }
  if (state.status === "available") {
    const version = state.version ? ` ${state.version}` : "";
    return { label: `Download Mauth Studio${version}…`, enabled: true, action: "download" };
  }
  if (state.status === "downloaded") {
    const version = state.version ? ` ${state.version}` : "";
    return { label: `Restart to Install Mauth Studio${version}…`, enabled: true, action: "restart" };
  }
  return { label: "Check for Updates…", enabled: true, action: "check" };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown update error");
}

export function createDesktopUpdaterController({
  enabled,
  updater,
  dialog,
  getWindow,
  log,
  refreshMenu,
  checkDelayMs = DEFAULT_CHECK_DELAY_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let state = initialDesktopUpdateState();
  let automaticCheckScheduled = false;
  let automaticCheckTimer = null;
  let manualCheckPending = false;
  let availablePromptVersion = null;
  let downloadedPromptVersion = null;

  const writeLog = (message) => log?.(`updater ${message}`);
  const setState = (patch) => {
    state = { ...state, ...patch };
    refreshMenu?.();
  };
  const showMessageBox = (options) => {
    const window = getWindow?.();
    return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
  };
  const setDownloadProgress = (percent) => {
    const window = getWindow?.();
    if (!window || window.isDestroyed?.()) return;
    window.setProgressBar(percent == null ? -1 : Math.max(0, Math.min(1, percent / 100)));
  };

  async function handleError(error) {
    const message = errorMessage(error);
    if (state.status === "error" && state.error === message) return;
    const wasDownloading = state.status === "downloading";
    const showError = manualCheckPending || wasDownloading;
    manualCheckPending = false;
    setDownloadProgress(null);
    setState({ status: "error", error: message, percent: null });
    writeLog(`error ${message}`);
    if (showError) {
      await showMessageBox({
        type: "error",
        title: wasDownloading ? "Mauth Studio update download failed" : "Mauth Studio update check failed",
        message: wasDownloading ? "Mauth Studio could not download the update." : "Mauth Studio could not check for updates.",
        detail: `${message}\n\nYour current app and documents are unchanged.`,
        buttons: ["OK"],
        defaultId: 0,
      });
    }
  }

  async function downloadAvailableUpdate(updateInfo, forcePrompt = false) {
    const version = updateInfo?.version || state.version;
    if (!forcePrompt && availablePromptVersion === version) return;
    availablePromptVersion = version;
    const result = await showMessageBox({
      type: "info",
      title: "Mauth Studio update available",
      message: `Mauth Studio ${version || "update"} is available.`,
      detail: releaseNotesText(updateInfo),
      buttons: ["Download update", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) return;
    setState({ status: "downloading", version: version || null, percent: 0, error: null });
    try {
      await updater.downloadUpdate();
    } catch (error) {
      await handleError(error);
    }
  }

  async function restartForDownloadedUpdate(updateInfo, forcePrompt = false) {
    const version = updateInfo?.version || state.version;
    if (!forcePrompt && downloadedPromptVersion === version) return;
    downloadedPromptVersion = version;
    const result = await showMessageBox({
      type: "info",
      title: "Mauth Studio update ready",
      message: `Mauth Studio ${version || "update"} is ready to install.`,
      detail: "Restart Mauth Studio to install the update. If the current document has unsaved changes, Mauth will ask before closing it.",
      buttons: ["Restart and update", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) updater.quitAndInstall(false, true);
  }

  async function checkForUpdates(manual = false) {
    if (!enabled || state.status === "checking" || state.status === "downloading") return;
    if (state.status === "available") {
      await downloadAvailableUpdate({ version: state.version }, true);
      return;
    }
    if (state.status === "downloaded") {
      await restartForDownloadedUpdate({ version: state.version }, true);
      return;
    }
    manualCheckPending = manual;
    setState({ status: "checking", error: null, percent: null });
    writeLog(`${manual ? "manual" : "automatic"} check started`);
    try {
      await updater.checkForUpdates();
    } catch (error) {
      await handleError(error);
    }
  }

  const listeners = {
    "checking-for-update": () => setState({ status: "checking", error: null }),
    "update-available": (info) => {
      manualCheckPending = false;
      setState({ status: "available", version: info?.version || null, percent: null, error: null });
      writeLog(`version ${info?.version || "unknown"} available`);
      void downloadAvailableUpdate(info);
    },
    "update-not-available": (info) => {
      const showCurrent = manualCheckPending;
      manualCheckPending = false;
      setState({ status: "current", version: info?.version || null, percent: null, error: null });
      writeLog("app is current");
      if (showCurrent) {
        void showMessageBox({
          type: "info",
          title: "Mauth Studio is up to date",
          message: "You are using the latest available Mauth Studio alpha.",
          buttons: ["OK"],
          defaultId: 0,
        });
      }
    },
    "download-progress": (progress) => {
      const percent = Number(progress?.percent);
      setDownloadProgress(Number.isFinite(percent) ? percent : 0);
      setState({ status: "downloading", percent: Number.isFinite(percent) ? percent : null, error: null });
    },
    "update-downloaded": (info) => {
      setDownloadProgress(null);
      setState({ status: "downloaded", version: info?.version || state.version, percent: 100, error: null });
      writeLog(`version ${info?.version || state.version || "unknown"} downloaded`);
      void restartForDownloadedUpdate(info);
    },
    error: (error) => void handleError(error),
  };

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = true;
  updater.allowDowngrade = false;
  for (const [event, listener] of Object.entries(listeners)) updater.on(event, listener);

  return {
    getState: () => ({ ...state }),
    menuItem() {
      const presentation = desktopUpdateMenuPresentation(state, enabled);
      return {
        label: presentation.label,
        enabled: presentation.enabled,
        click: () => void checkForUpdates(true),
      };
    },
    scheduleAutomaticCheck() {
      if (!enabled || automaticCheckScheduled) return false;
      automaticCheckScheduled = true;
      automaticCheckTimer = setTimeoutFn(() => void checkForUpdates(false), checkDelayMs);
      return true;
    },
    checkManually: () => checkForUpdates(true),
    dispose() {
      if (automaticCheckTimer) clearTimeoutFn(automaticCheckTimer);
      for (const [event, listener] of Object.entries(listeners)) updater.removeListener(event, listener);
      setDownloadProgress(null);
    },
  };
}
