export const MAUTH_SYSTEM_STATUS_OPEN_CHANNEL = "mauth:open-system-status";
export const MAUTH_THEME_TOGGLE_CHANNEL = "mauth:toggle-theme";
export const MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL = "mauth:open-solution-validation";
export const MAUTH_ACTIVE_DOCUMENT_CLOSE_CHANNEL = "mauth:close-active-document";
export const MAUTH_WINDOW_CLOSE_REQUEST_CHANNEL = "mauth:request-window-close";
export const MAUTH_FILE_COMMAND_CHANNEL = "mauth:file-command";

export function sendDesktopMenuCommand(browserWindow, channel) {
  if (!browserWindow || browserWindow.isDestroyed?.() || browserWindow.webContents?.isDestroyed?.()) return false;
  browserWindow.webContents.send(channel);
  return true;
}

export function desktopFileMenuItems({ closeActiveDocument, closeWindow, command = () => {} }) {
  return [
    { label: "New…", accelerator: "CmdOrCtrl+N", click: () => command("new") },
    { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => command("open") },
    { label: "Open Recent", role: "recentDocuments", submenu: [{ role: "clearRecentDocuments" }] },
    { type: "separator" },
    { label: "Save", accelerator: "CmdOrCtrl+S", click: () => command("save") },
    { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => command("save-as") },
    { label: "Show in Finder", click: () => command("reveal") },
    { type: "separator" },
    { label: "Back Up Folder…", click: () => command("backup") },
    { label: "Restore Backup…", click: () => command("restore") },
    { label: "Version History…", click: () => command("versions") },
    { type: "separator" },
    { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: closeActiveDocument },
    { label: "Close Window", accelerator: "CmdOrCtrl+Shift+W", click: closeWindow },
  ];
}
