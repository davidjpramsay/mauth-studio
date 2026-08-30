export const MAUTH_SYSTEM_STATUS_OPEN_CHANNEL = "mauth:open-system-status";
export const MAUTH_THEME_TOGGLE_CHANNEL = "mauth:toggle-theme";
export const MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL = "mauth:open-solution-validation";
export const MAUTH_ACTIVE_DOCUMENT_CLOSE_CHANNEL = "mauth:close-active-document";
export const MAUTH_WINDOW_CLOSE_REQUEST_CHANNEL = "mauth:request-window-close";

export function sendDesktopMenuCommand(browserWindow, channel) {
  if (!browserWindow || browserWindow.isDestroyed?.() || browserWindow.webContents?.isDestroyed?.()) return false;
  browserWindow.webContents.send(channel);
  return true;
}

export function desktopFileMenuItems({ closeActiveDocument, closeWindow }) {
  return [
    { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: closeActiveDocument },
    { label: "Close Window", accelerator: "CmdOrCtrl+Shift+W", click: closeWindow },
  ];
}
