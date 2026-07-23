const { contextBridge, ipcRenderer } = require("electron");

const MAUTH_DOCUMENT_OPEN_CHANNEL = "mauth:open-document";
const MAUTH_AGENT_CONNECTOR_INFO_CHANNEL = "mauth:agent-connector-info";
const MAUTH_AGENT_SETUP_OPEN_CHANNEL = "mauth:open-agent-setup";
const pendingDocumentPaths = [];
const documentOpenListeners = new Set();
const agentSetupListeners = new Set();

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

contextBridge.exposeInMainWorld("mauthDesktop", {
  getAgentConnectorInfo() {
    return ipcRenderer.invoke(MAUTH_AGENT_CONNECTOR_INFO_CHANNEL);
  },
  onOpenAgentSetup(listener) {
    if (typeof listener !== "function") return () => {};
    agentSetupListeners.add(listener);
    return () => agentSetupListeners.delete(listener);
  },
  onOpenDocument(listener) {
    if (typeof listener !== "function") return () => {};
    documentOpenListeners.add(listener);
    for (const filePath of pendingDocumentPaths.splice(0)) listener(filePath);
    return () => documentOpenListeners.delete(listener);
  },
});
