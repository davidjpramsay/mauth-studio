const { contextBridge, ipcRenderer } = require("electron");

const MAUTH_DOCUMENT_OPEN_CHANNEL = "mauth:open-document";
const MAUTH_AGENT_CONNECTOR_INFO_CHANNEL = "mauth:agent-connector-info";
const MAUTH_AGENT_SETUP_OPEN_CHANNEL = "mauth:open-agent-setup";
const MAUTH_SYSTEM_STATUS_OPEN_CHANNEL = "mauth:open-system-status";
const MAUTH_THEME_TOGGLE_CHANNEL = "mauth:toggle-theme";
const MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL = "mauth:open-solution-validation";
const pendingDocumentPaths = [];
const documentOpenListeners = new Set();
const agentSetupListeners = new Set();
const systemStatusListeners = new Set();
const themeToggleListeners = new Set();
const solutionValidationListeners = new Set();

ipcRenderer.on(MAUTH_DOCUMENT_OPEN_CHANNEL, (_event, filePath) => {
  if (typeof filePath !== "string") return;
  if (!documentOpenListeners.size) {
    pendingDocumentPaths.push(filePath);
    return;
  }
  for (const listener of documentOpenListeners) listener(filePath);
});

ipcRenderer.on(MAUTH_AGENT_SETUP_OPEN_CHANNEL, () => {
  for (const listener of agentSetupListeners) listener();
});

ipcRenderer.on(MAUTH_SYSTEM_STATUS_OPEN_CHANNEL, () => {
  for (const listener of systemStatusListeners) listener();
});

ipcRenderer.on(MAUTH_THEME_TOGGLE_CHANNEL, () => {
  for (const listener of themeToggleListeners) listener();
});

ipcRenderer.on(MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL, () => {
  for (const listener of solutionValidationListeners) listener();
});

contextBridge.exposeInMainWorld("mauthDesktop", {
  getAgentConnectorInfo() {
    return ipcRenderer.invoke(MAUTH_AGENT_CONNECTOR_INFO_CHANNEL);
  },
  onOpenAgentSetup(listener) {
    if (typeof listener !== "function") return () => {};
    agentSetupListeners.add(listener);
    return () => agentSetupListeners.delete(listener);
  },
  onOpenSystemStatus(listener) {
    if (typeof listener !== "function") return () => {};
    systemStatusListeners.add(listener);
    return () => systemStatusListeners.delete(listener);
  },
  onToggleTheme(listener) {
    if (typeof listener !== "function") return () => {};
    themeToggleListeners.add(listener);
    return () => themeToggleListeners.delete(listener);
  },
  onOpenSolutionValidation(listener) {
    if (typeof listener !== "function") return () => {};
    solutionValidationListeners.add(listener);
    return () => solutionValidationListeners.delete(listener);
  },
  onOpenDocument(listener) {
    if (typeof listener !== "function") return () => {};
    documentOpenListeners.add(listener);
    for (const filePath of pendingDocumentPaths.splice(0)) listener(filePath);
    return () => documentOpenListeners.delete(listener);
  },
});
